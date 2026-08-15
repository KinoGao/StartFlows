import { randomUUID } from "node:crypto";

import { lockAuthMutation } from "@/lib/server/auth-mutation-lock";
import { BillingInputError, isBillingInputError } from "@/lib/server/billing-errors";
import { finalizeBillingOrderRefund } from "@/lib/server/billing-refund-finalization-service";
import { createPostgresRepositories, withPostgresTransaction, type BillingOrderRecord, type BillingRefundJobRecord, type JsonValue, type PaymentTransactionRecord } from "@/lib/server/database";
import { assertBillingDatabaseReady, buildRefundedOrderResult, isRefundClaimStale, mergeJson, normalizeId, normalizeOptionalText, normalizeText, paymentRefundMetadata, readRefundAttempt, sanitizeJson } from "@/lib/server/billing-service-helpers";
import { reconcilePaymentRefund, refundPaymentTransaction, type PaymentRefundResult } from "@/lib/server/payment-refund-service";

type BillingRefundInput = { reason?: unknown; operatorUserId?: unknown; rawPayload?: unknown };
type RefundClaim = { order: BillingOrderRecord; payment?: PaymentTransactionRecord; job: BillingRefundJobRecord; reason: string; operatorUserId: string; rawPayload?: unknown };

const REFUND_JOB_LEASE_MS = 2 * 60_000;

export async function refundBillingOrder(orderId: string, input: BillingRefundInput = {}) {
    await assertBillingDatabaseReady();
    const workerId = `billing-refund:request:${randomUUID()}`;
    const claim = await claimBillingRefund(normalizeId(orderId), input, workerId);
    if ("completed" in claim) return claim.completed;
    return processRefundClaim(claim, workerId);
}

export async function runBillingRefundReconciliationBatch(input: { workerId: string; limit?: number; now?: Date }) {
    await assertBillingDatabaseReady();
    const workerId = normalizeText(input.workerId, "", 160);
    if (!workerId) throw new BillingInputError("退款 Worker ID 不能为空", 400);
    const now = input.now || new Date();
    const jobs = await createPostgresRepositories().billing.claimDueRefundJobs({
        workerId,
        now: now.toISOString(),
        leaseUntil: new Date(now.getTime() + REFUND_JOB_LEASE_MS).toISOString(),
        limit: Math.max(1, Math.min(20, Math.floor(Number(input.limit) || 5))),
    });
    const results = [] as Array<"completed" | "pending" | "manual" | "failed">;
    for (const job of jobs) results.push(await processClaimedJob(job, workerId));
    return {
        claimed: jobs.length,
        completed: results.filter((item) => item === "completed").length,
        pending: results.filter((item) => item === "pending").length,
        manual: results.filter((item) => item === "manual").length,
        failed: results.filter((item) => item === "failed").length,
    };
}

async function claimBillingRefund(orderId: string, input: BillingRefundInput, workerId: string): Promise<RefundClaim | { completed: Awaited<ReturnType<typeof buildRefundedOrderResult>> }> {
    return withPostgresTransaction(async (client) => {
        await lockAuthMutation(client);
        const repos = createPostgresRepositories(client);
        const order = await repos.billing.getOrderById(orderId, true);
        if (!order) throw new BillingInputError("订单不存在", 404);
        if (order.status === "refunded") return { completed: await buildRefundedOrderResult(order, client) };
        const existing = await repos.billing.getRefundJobByOrderId(order.id, true);
        const now = new Date();
        if (jobLeaseActive(existing, now) || (order.status === "refunding" && !existing && !isRefundClaimStale(order))) throw new BillingInputError("退款正在处理中，请稍后再试", 409);
        if (order.status !== "paid" && order.status !== "refunding") throw new BillingInputError("只有已支付订单可以退款", 409);
        if (!order.userId) throw new BillingInputError("订单没有绑定用户", 409);
        const payment = (await repos.billing.findOrderPayment({ orderId: order.id, statuses: ["succeeded", "refunded"] })) || undefined;
        const reason = normalizeText(input.reason, "运营退款", 200);
        const operatorUserId = normalizeOptionalText(input.operatorUserId, 120) || "";
        const claimId = randomUUID();
        const nowIso = now.toISOString();
        const claimedOrder = await repos.billing.updateOrder(order.id, {
            status: "refunding",
            metadata: mergeJson(order.metadata, { refundAttempt: { claimId, reason, operatorUserId, startedAt: nowIso } }),
        });
        if (!claimedOrder) throw new BillingInputError("订单不存在", 404);
        const currentRefund = paymentRefundFromJob(existing);
        const status = currentRefund && currentRefund.status !== "pending" ? "compensating" : "processing";
        const job = await repos.billing.upsertRefundJob({
            id: existing?.id || randomUUID(),
            orderId: order.id,
            paymentId: payment?.id || existing?.paymentId,
            provider: payment?.provider || order.provider,
            status,
            providerRefundId: currentRefund?.providerRefundId || existing?.providerRefundId,
            attempts: (existing?.attempts || 0) + 1,
            nextAttemptAt: nowIso,
            rawPayload: refundJobPayload(existing?.rawPayload, { reason, operatorUserId, providerRefund: currentRefund }),
            workerId,
            leaseUntil: new Date(now.getTime() + REFUND_JOB_LEASE_MS).toISOString(),
            createdAt: existing?.createdAt || nowIso,
            updatedAt: nowIso,
        });
        return { order: claimedOrder, payment, job, reason, operatorUserId, rawPayload: input.rawPayload };
    });
}

async function processClaimedJob(job: BillingRefundJobRecord, workerId: string) {
    const repos = createPostgresRepositories();
    const order = await repos.billing.getOrderById(job.orderId);
    if (!order) {
        await releaseJob(job, workerId, "failed", "退款订单不存在");
        return "failed" as const;
    }
    if (order.status === "refunded") {
        await releaseJob(job, workerId, "completed", undefined, new Date().toISOString());
        return "completed" as const;
    }
    const payment = (await repos.billing.findOrderPayment({ orderId: order.id, preferredPaymentId: job.paymentId, statuses: ["succeeded", "refunded"] })) || undefined;
    const context = refundJobContext(job.rawPayload);
    const claim: RefundClaim = {
        order,
        payment,
        job,
        reason: normalizeText(context.reason, "运营退款", 200),
        operatorUserId: normalizeText(context.operatorUserId, "", 120),
    };
    try {
        const result = await processRefundClaim(claim, workerId);
        if ("manual" in result && result.manual) return "manual" as const;
        if ("pending" in result && result.pending) return "pending" as const;
        return "completed" as const;
    } catch (error) {
        console.error("Billing refund reconciliation failed", { orderId: order.id, jobId: job.id, error: error instanceof Error ? error.message : "unknown" });
        return "failed" as const;
    }
}

async function processRefundClaim(claim: RefundClaim, workerId: string) {
    let providerRefund = paymentRefundFromJob(claim.job);
    try {
        if (!providerRefund || providerRefund.status === "pending") {
            providerRefund = providerRefund
                ? await reconcilePaymentRefund(claim.order, claim.payment, providerRefund, { reason: claim.reason, operatorUserId: claim.operatorUserId })
                : await refundPaymentTransaction(claim.order, claim.payment, { reason: claim.reason, operatorUserId: claim.operatorUserId });
        }
        const payload = refundJobPayload(claim.job.rawPayload, { reason: claim.reason, operatorUserId: claim.operatorUserId, providerRefund });
        if (providerRefund.status === "pending") {
            await releaseJob(claim.job, workerId, retryStatus(claim.job), undefined, undefined, providerRefund, payload);
            return { order: claim.order, providerRefund, pending: true };
        }
        await createPostgresRepositories().billing.checkpointRefundJob(claim.job.id, workerId, {
            status: "compensating",
            providerRefundId: providerRefund.providerRefundId,
            nextAttemptAt: new Date().toISOString(),
            lastError: undefined,
            rawPayload: payload,
        });
        const result = await finalizeBillingOrderRefund({
            orderId: claim.order.id,
            paymentId: claim.payment?.id,
            reason: claim.reason,
            operatorUserId: claim.operatorUserId,
            providerRefund,
            rawPayload: claim.rawPayload,
        });
        await releaseJob(claim.job, workerId, "completed", undefined, new Date().toISOString(), providerRefund, payload);
        return result;
    } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 300) : "退款处理失败";
        const providerRefundConfirmed = providerRefund && providerRefund.status !== "pending";
        if (providerRefundConfirmed || isRetryableRefundError(error)) {
            const retryJob = providerRefundConfirmed ? { ...claim.job, status: "compensating" as const } : claim.job;
            const status = retryStatus(retryJob);
            await releaseJob(claim.job, workerId, status, message, undefined, providerRefund);
            await markOrderRefundDeferred(claim.order, message, status);
            return { order: claim.order, providerRefund: providerRefund || pendingRefund(claim), pending: status !== "manual", manual: status === "manual" };
        }
        await releaseJob(claim.job, workerId, "failed", message, undefined, providerRefund);
        await markOrderRefundFailed(claim.order, message);
        throw error;
    }
}

async function releaseJob(job: BillingRefundJobRecord, workerId: string, status: BillingRefundJobRecord["status"], error?: string, completedAt?: string, providerRefund?: PaymentRefundResult, rawPayload?: JsonValue) {
    const nextAttemptAt = status === "pending" || status === "processing" || status === "compensating" ? new Date().toISOString() : undefined;
    return createPostgresRepositories().billing.releaseRefundJob(job.id, workerId, {
        status,
        attempts: job.attempts,
        providerRefundId: providerRefund?.providerRefundId || job.providerRefundId,
        nextAttemptAt,
        lastError: error,
        rawPayload: rawPayload || (providerRefund ? refundJobPayload(job.rawPayload, { providerRefund }) : job.rawPayload),
        completedAt,
    });
}

function retryStatus(job: BillingRefundJobRecord): BillingRefundJobRecord["status"] {
    return job.status === "compensating" ? "compensating" : "pending";
}

async function markOrderRefundDeferred(order: BillingOrderRecord, error: string, status: BillingRefundJobRecord["status"]) {
    await createPostgresRepositories().billing.updateOrder(order.id, {
        status: "refunding",
        metadata: mergeJson(order.metadata, { refund: { status, error, updatedAt: new Date().toISOString() } }),
    });
}

async function markOrderRefundFailed(order: BillingOrderRecord, error: string) {
    await withPostgresTransaction(async (client) => {
        const repos = createPostgresRepositories(client);
        const current = await repos.billing.getOrderById(order.id, true);
        if (current?.status !== "refunding") return;
        await repos.billing.updateOrder(current.id, {
            status: "paid",
            metadata: mergeJson(current.metadata, { refundAttempt: { ...(readRefundAttempt(current.metadata) || {}), failedAt: new Date().toISOString(), error } }),
        });
    });
}

function paymentRefundFromJob(job: BillingRefundJobRecord | null | undefined): PaymentRefundResult | undefined {
    const context = refundJobContext(job?.rawPayload);
    const value = context.providerRefund;
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const record = value as Record<string, unknown>;
    const provider = normalizeText(record.provider, "", 60);
    const status = record.status;
    if (!provider || (status !== "succeeded" && status !== "pending" && status !== "manual")) return undefined;
    return {
        provider,
        status,
        providerRefundId: normalizeOptionalText(record.providerRefundId, 160),
        rawPayload: sanitizeJson(record.rawPayload),
    };
}

function refundJobPayload(current: JsonValue | undefined, patch: { reason?: string; operatorUserId?: string; providerRefund?: PaymentRefundResult }) {
    const source = refundJobContext(current);
    return sanitizeJson({
        ...source,
        ...(patch.reason !== undefined ? { reason: patch.reason } : {}),
        ...(patch.operatorUserId !== undefined ? { operatorUserId: patch.operatorUserId } : {}),
        ...(patch.providerRefund
            ? {
                  providerRefund: {
                      ...paymentRefundMetadata(patch.providerRefund, false),
                      rawPayload: sanitizeJson(patch.providerRefund.rawPayload),
                  },
              }
            : {}),
    });
}

function refundJobContext(value: JsonValue | undefined): Record<string, JsonValue> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, JsonValue>) : {};
}

function pendingRefund(claim: RefundClaim): PaymentRefundResult {
    return { provider: claim.payment?.provider || claim.order.provider, status: "pending" };
}

function jobLeaseActive(job: BillingRefundJobRecord | null, now: Date) {
    return Boolean(job?.workerId && job.leaseUntil && Date.parse(job.leaseUntil) > now.getTime() && (job.status === "processing" || job.status === "compensating"));
}

function isRetryableRefundError(error: unknown) {
    if (!isBillingInputError(error)) return true;
    return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
}
