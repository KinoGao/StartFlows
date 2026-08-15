import { randomUUID } from "node:crypto";

import { BillingInputError, isBillingInputError } from "@/lib/server/billing-errors";
import { completeBillingOrderPayment } from "@/lib/server/billing-service";
import { createPostgresRepositories, ensurePostgresSchema, isPostgresDatabaseEnabled, type JsonValue } from "@/lib/server/database";
import { getPaymentRuntimeConfig } from "@/lib/server/payment-config-store";
import { verifyPaymentTransaction } from "@/lib/server/payment-transaction-verification";
import { deterministicEventId, normalizeProvider, parseFallbackEvent, resolveWebhookAdapter, sanitizeJson, type ParsedPaymentWebhook } from "./payment-webhook-adapters";

type ProcessPaymentWebhookResult = {
    received: true;
    provider: string;
    eventId: string;
    eventType: string;
    duplicate?: boolean;
    processing?: boolean;
    ignored?: boolean;
    pendingVerification?: boolean;
    orderId?: string;
    orderNo?: string;
    orderStatus?: string;
    pointsGranted?: number;
};

export async function processPaymentWebhook(input: { provider: string; rawBody: string; headers: Headers }): Promise<ProcessPaymentWebhookResult> {
    if (!isPostgresDatabaseEnabled()) throw new BillingInputError("支付回调需要启用 PostgreSQL", 501);
    await ensurePostgresSchema();

    const provider = normalizeProvider(input.provider);
    const paymentConfig = await getPaymentRuntimeConfig();
    const adapter = resolveWebhookAdapter(provider);
    let parsed: ParsedPaymentWebhook;
    try {
        parsed = adapter.parse(provider, input.rawBody, input.headers, paymentConfig);
    } catch (error) {
        const fallback = parseFallbackEvent(input.rawBody);
        await safeRecordWebhookEvent(provider, {
            eventId: fallback.eventId,
            eventType: fallback.eventType,
            orderId: fallback.orderId,
            signatureValid: false,
            payload: fallback.payload,
            error: error instanceof Error ? error.message : "invalid webhook",
        });
        throw error;
    }

    if (!parsed.signatureValid) {
        await safeRecordWebhookEvent(provider, { ...parsed, error: "signature invalid" });
        throw new BillingInputError("支付回调签名无效", 401);
    }

    const orderId = await resolveWebhookOrderId(parsed);
    const recorded = await recordWebhookEvent(provider, { ...parsed, orderId });
    const event = recorded.event;
    if (recorded.conflict) {
        await createPostgresRepositories().billing.markProviderEventConflict(event.id);
        throw new BillingInputError("支付回调事件编号已对应不同载荷", 409);
    }
    if (event.processedAt) {
        return { received: true, provider, eventId: parsed.eventId, eventType: parsed.eventType, duplicate: true, orderId, orderNo: parsed.orderNo };
    }

    const claimed = await claimWebhookEvent(event.id);
    if (!claimed) {
        return { received: true, provider, eventId: parsed.eventId, eventType: parsed.eventType, processing: true, orderId, orderNo: parsed.orderNo };
    }

    if (parsed.status !== "succeeded" || !orderId) {
        await markWebhookEventProcessed(event.id);
        return { received: true, provider, eventId: parsed.eventId, eventType: parsed.eventType, ignored: true, orderId, orderNo: parsed.orderNo };
    }

    try {
        const order = await createPostgresRepositories().billing.getOrderById(orderId);
        if (!order) {
            await markWebhookEventProcessed(event.id, "payment order not found");
            return { received: true, provider, eventId: parsed.eventId, eventType: parsed.eventType, ignored: true, orderId, orderNo: parsed.orderNo };
        }
        const verification = await verifyPaymentTransaction(provider, parsed, order);
        if (!verification.verified) {
            await releaseWebhookEvent(event.id, `pending_verification: ${verification.reason}`);
            return {
                received: true,
                provider,
                eventId: parsed.eventId,
                eventType: parsed.eventType,
                pendingVerification: true,
                orderId,
                orderNo: order.orderNo,
            };
        }
        const payment = verification.payment;
        const result = await completeBillingOrderPayment({
            orderId,
            provider,
            channel: parsed.eventType,
            providerTradeId: payment.providerTradeId,
            providerPaymentId: payment.providerPaymentId,
            amountCents: payment.amountCents,
            currency: payment.currency,
            rawPayload: payment.rawPayload,
            paidAt: payment.paidAt,
            verificationSource: "provider",
        });
        await markWebhookEventProcessed(event.id);
        return {
            received: true,
            provider,
            eventId: parsed.eventId,
            eventType: parsed.eventType,
            orderId,
            orderNo: result.order.orderNo,
            orderStatus: result.order.status,
            pointsGranted: result.pointsGranted,
        };
    } catch (error) {
        if (isBillingInputError(error) && error.status === 409) {
            await markWebhookEventProcessed(event.id, error.message);
            throw error;
        }
        await releaseWebhookEvent(event.id, error instanceof Error ? error.message : "payment complete failed");
        throw error;
    }
}

async function resolveWebhookOrderId(parsed: ParsedPaymentWebhook) {
    if (parsed.orderId) return parsed.orderId;
    if (!parsed.orderNo) return undefined;
    return (await createPostgresRepositories().billing.getOrderByOrderNo(parsed.orderNo))?.id;
}

async function recordWebhookEvent(provider: string, parsed: ParsedPaymentWebhook & { orderId?: string; error?: string }) {
    const now = new Date().toISOString();
    return createPostgresRepositories().billing.upsertProviderEvent({
        id: randomUUID(),
        provider,
        eventId: parsed.eventId,
        eventType: parsed.eventType,
        orderId: parsed.orderId,
        signatureValid: parsed.signatureValid,
        payload: sanitizeJson(parsed.payload),
        error: parsed.error,
        createdAt: now,
        updatedAt: now,
    });
}

async function safeRecordWebhookEvent(provider: string, parsed: { eventId?: string; eventType?: string; orderId?: string; signatureValid: boolean; payload?: unknown; error?: string }) {
    try {
        const now = new Date().toISOString();
        const eventId = parsed.eventId || deterministicEventId(provider, JSON.stringify(parsed.payload || {}));
        await createPostgresRepositories().billing.upsertProviderEvent({
            id: randomUUID(),
            provider,
            eventId: parsed.signatureValid ? eventId : `${eventId}:invalid:${deterministicEventId(provider, JSON.stringify(parsed.payload || {})).slice(-12)}`,
            eventType: parsed.eventType || "payment.webhook",
            orderId: parsed.orderId,
            signatureValid: parsed.signatureValid,
            payload: sanitizeJson(parsed.payload),
            error: parsed.error,
            createdAt: now,
            updatedAt: now,
        });
    } catch (error) {
        console.error("Payment webhook event write failed", error);
    }
}

async function claimWebhookEvent(id: string) {
    const result = await createPostgresRepositories().billing.claimProviderEvent(id);
    return result !== null;
}

async function markWebhookEventProcessed(id: string, error?: string) {
    await createPostgresRepositories().billing.markProviderEventProcessed(id, error);
}

async function releaseWebhookEvent(id: string, error?: string) {
    await createPostgresRepositories().billing.releaseProviderEvent(id, error);
}
