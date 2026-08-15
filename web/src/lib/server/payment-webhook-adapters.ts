import { createDecipheriv, createHmac, timingSafeEqual } from "node:crypto";

import { normalizePaymentProvider } from "@/lib/payment-provider";
import { BillingInputError } from "@/lib/server/billing-errors";
import type { JsonValue } from "@/lib/server/database";
import { getPaymentRuntimeEnv, getPaymentRuntimeValue, type PaymentRuntimeConfig } from "@/lib/server/payment-config-store";
import { loadPaymentPublicKey, verifyRsaSha256 } from "@/lib/server/payment-signature-utils";

type WebhookStatus = "succeeded" | "ignored";

export type ParsedPaymentWebhook = {
    eventId: string;
    eventType: string;
    orderId?: string;
    orderNo?: string;
    status: WebhookStatus;
    providerTradeId?: string;
    providerPaymentId?: string;
    amountCents?: number;
    currency?: string;
    paidAt?: string;
    payload: unknown;
    signatureValid: boolean;
};

type PaymentWebhookAdapter = {
    parse(provider: string, rawBody: string, headers: Headers, paymentConfig: PaymentRuntimeConfig): ParsedPaymentWebhook;
};

const customWebhookAdapter: PaymentWebhookAdapter = {
    parse(provider, rawBody, headers, paymentConfig) {
        const payload = parseJsonPayload(rawBody);
        const fieldPrefix = providerEnvPrefix(provider);
        const eventId = normalizeText(readConfiguredPath(paymentConfig, payload, `${fieldPrefix}_WEBHOOK_EVENT_ID_FIELD`, ["eventId", "id", "data.eventId", "data.id"]), deterministicEventId(provider, rawBody), 160);
        const eventType = normalizeText(readConfiguredPath(paymentConfig, payload, `${fieldPrefix}_WEBHOOK_EVENT_TYPE_FIELD`, ["eventType", "type", "data.eventType", "data.type"]), "payment.webhook", 120);
        return {
            eventId,
            eventType,
            orderId: normalizeOptionalId(readConfiguredPath(paymentConfig, payload, `${fieldPrefix}_WEBHOOK_ORDER_ID_FIELD`, ["orderId", "data.orderId", "metadata.orderId", "metadata.vozebProOrderId"])),
            orderNo: normalizeOptionalId(readConfiguredPath(paymentConfig, payload, `${fieldPrefix}_WEBHOOK_ORDER_NO_FIELD`, ["orderNo", "outTradeNo", "out_trade_no", "data.orderNo", "data.outTradeNo", "metadata.orderNo", "metadata.vozebProOrderNo"])),
            status: normalizePaymentStatus(readConfiguredPath(paymentConfig, payload, `${fieldPrefix}_WEBHOOK_STATUS_FIELD`, ["status", "tradeStatus", "trade_status", "data.status", "data.tradeStatus"]), provider, paymentConfig),
            providerTradeId: normalizeOptionalText(
                readConfiguredPath(paymentConfig, payload, `${fieldPrefix}_WEBHOOK_TRADE_ID_FIELD`, ["providerTradeId", "tradeId", "trade_no", "transactionId", "data.providerTradeId", "data.tradeId", "data.transactionId"]),
                160,
            ),
            providerPaymentId: normalizeOptionalText(
                readConfiguredPath(paymentConfig, payload, `${fieldPrefix}_WEBHOOK_PAYMENT_ID_FIELD`, ["providerPaymentId", "paymentId", "payment_id", "transactionId", "data.providerPaymentId", "data.paymentId", "data.transactionId"]),
                160,
            ),
            amountCents:
                normalizeOptionalInteger(readConfiguredPath(paymentConfig, payload, `${fieldPrefix}_WEBHOOK_AMOUNT_CENTS_FIELD`, ["amountCents", "data.amountCents"])) ??
                yuanDecimalToCents(readConfiguredPath(paymentConfig, payload, `${fieldPrefix}_WEBHOOK_AMOUNT_YUAN_FIELD`, ["amount", "amountYuan", "totalAmount", "data.amount", "data.totalAmount"])),
            currency: normalizeCurrency(readConfiguredPath(paymentConfig, payload, `${fieldPrefix}_WEBHOOK_CURRENCY_FIELD`, ["currency", "data.currency"])),
            paidAt: normalizeOptionalIso(readConfiguredPath(paymentConfig, payload, `${fieldPrefix}_WEBHOOK_PAID_AT_FIELD`, ["paidAt", "successTime", "paid_time", "data.paidAt", "data.successTime"])),
            payload,
            signatureValid: verifyCustomSignature(provider, rawBody, headers, paymentConfig),
        };
    },
};

const stripeWebhookAdapter: PaymentWebhookAdapter = {
    parse(provider, rawBody, headers, paymentConfig) {
        verifyStripeSignature(rawBody, headers, paymentConfig);
        const event = parseJsonPayload(rawBody);
        const eventId = normalizeText(readPath(event, "id"), deterministicEventId(provider, rawBody), 160);
        const eventType = normalizeText(readPath(event, "type"), "stripe.event", 120);
        const object = readPath(event, "data.object");
        const orderId = normalizeOptionalId(readPath(object, "metadata.orderId") || readPath(object, "metadata.vozebProOrderId") || readPath(object, "client_reference_id"));
        const orderNo = normalizeOptionalId(readPath(object, "metadata.orderNo") || readPath(object, "metadata.vozebProOrderNo"));
        const amountCents = normalizeOptionalInteger(readPath(object, "amount_total") || readPath(object, "amount_received") || readPath(object, "amount"));
        const paidAt = normalizeStripePaidAt(readPath(object, "created"));
        const providerTradeId = normalizeOptionalText(readPath(object, "payment_intent") || readPath(object, "id"), 160);
        const providerPaymentId = normalizeOptionalText(readPath(object, "latest_charge") || readPath(object, "id"), 160);
        return {
            eventId,
            eventType,
            orderId,
            orderNo,
            status: isStripeSuccessEvent(eventType, object) ? "succeeded" : "ignored",
            providerTradeId,
            providerPaymentId,
            amountCents,
            currency: normalizeCurrency(readPath(object, "currency")),
            paidAt,
            payload: event,
            signatureValid: true,
        };
    },
};

const alipayWebhookAdapter: PaymentWebhookAdapter = {
    parse(provider, rawBody, _headers, paymentConfig) {
        const payload = parseFormPayload(rawBody);
        const tradeStatus = normalizeText(payload.trade_status, "", 80).toUpperCase();
        const eventType = tradeStatus ? `alipay.${tradeStatus.toLowerCase()}` : "alipay.notify";
        const orderNo = normalizeOptionalId(payload.out_trade_no);
        const orderId = normalizeOptionalId(decodeMaybeUrlEncoded(payload.passback_params));
        return {
            eventId: normalizeText(payload.notify_id || payload.trade_no, deterministicEventId(provider, rawBody), 160),
            eventType,
            orderId,
            orderNo,
            status: tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED" ? "succeeded" : "ignored",
            providerTradeId: normalizeOptionalText(payload.trade_no, 160),
            providerPaymentId: normalizeOptionalText(payload.trade_no, 160),
            amountCents: yuanDecimalToCents(payload.total_amount),
            currency: "CNY",
            paidAt: parseAlipayDate(payload.gmt_payment || payload.notify_time),
            payload,
            signatureValid: verifyAlipaySignature(payload, paymentConfig),
        };
    },
};

const wechatWebhookAdapter: PaymentWebhookAdapter = {
    parse(provider, rawBody, headers, paymentConfig) {
        const envelope = parseJsonPayload(rawBody);
        const eventId = normalizeText(readPath(envelope, "id"), deterministicEventId(provider, rawBody), 160);
        const eventType = normalizeText(readPath(envelope, "event_type"), "wechat.notify", 120);
        const signatureValid = verifyWechatSignature(rawBody, headers, paymentConfig);
        if (!signatureValid) {
            return {
                eventId,
                eventType,
                status: "ignored",
                payload: envelope,
                signatureValid: false,
            };
        }

        const transaction = decryptWechatResource(envelope, paymentConfig);
        const tradeState = normalizeText(readPath(transaction, "trade_state"), "", 80).toUpperCase();
        const orderNo = normalizeOptionalId(readPath(transaction, "out_trade_no"));
        const transactionId = normalizeOptionalText(readPath(transaction, "transaction_id"), 160);
        return {
            eventId,
            eventType,
            orderNo,
            status: eventType === "TRANSACTION.SUCCESS" && tradeState === "SUCCESS" ? "succeeded" : "ignored",
            providerTradeId: transactionId,
            providerPaymentId: transactionId,
            amountCents: normalizeOptionalInteger(readPath(transaction, "amount.payer_total") || readPath(transaction, "amount.total")),
            currency: normalizeCurrency(readPath(transaction, "amount.payer_currency") || readPath(transaction, "amount.currency") || "CNY"),
            paidAt: normalizeOptionalIso(readPath(transaction, "success_time")),
            payload: { envelope: sanitizeJson(envelope), transaction: sanitizeJson(transaction) },
            signatureValid: true,
        };
    },
};

export function resolveWebhookAdapter(provider: string) {
    if (provider === "stripe") return stripeWebhookAdapter;
    if (provider === "alipay") return alipayWebhookAdapter;
    if (provider === "wechat") return wechatWebhookAdapter;
    return customWebhookAdapter;
}

export function verifyCustomSignature(provider: string, rawBody: string, headers: Headers, paymentConfig: PaymentRuntimeConfig) {
    const secret = webhookSecret(provider, paymentConfig);
    if (!secret) throw new BillingInputError("支付回调密钥未配置", 500);
    const signature = normalizeSignatureHeader(headers.get(getPaymentRuntimeEnv(paymentConfig, `${providerEnvPrefix(provider)}_WEBHOOK_SIGNATURE_HEADER`) || "x-vozeb-pro-signature") || headers.get("x-payment-signature") || headers.get("x-signature"));
    if (!signature) return false;
    const timestamp = headers.get("x-vozeb-pro-timestamp") || headers.get("x-payment-timestamp") || "";
    const signedPayload = timestamp ? `${timestamp}.${rawBody}` : rawBody;
    const expected = createHmac("sha256", secret).update(signedPayload).digest("hex");
    if (!safeEqual(signature, expected)) return false;
    if (timestamp) {
        const timestampMs = Number(timestamp) * 1000;
        if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) return false;
    }
    return true;
}

export function verifyStripeSignature(rawBody: string, headers: Headers, paymentConfig: PaymentRuntimeConfig) {
    const secret = getPaymentRuntimeValue(paymentConfig, "VOZEB_PRO_STRIPE_WEBHOOK_SECRET", "STRIPE_WEBHOOK_SECRET");
    if (!secret) throw new BillingInputError("Stripe 回调密钥未配置", 500);
    const header = headers.get("stripe-signature") || "";
    const parts = Object.fromEntries(
        header
            .split(",")
            .map((part) => part.split("=").map((item) => item.trim()))
            .filter((part) => part.length === 2),
    );
    const timestamp = parts.t || "";
    const signature = parts.v1 || "";
    if (!timestamp || !signature) throw new BillingInputError("Stripe 回调签名缺失", 401);
    const timestampMs = Number(timestamp) * 1000;
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > stripeToleranceMs(paymentConfig)) throw new BillingInputError("Stripe 回调时间戳无效", 401);
    const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
    if (!safeEqual(signature, expected)) throw new BillingInputError("Stripe 回调签名无效", 401);
}

export function verifyAlipaySignature(payload: Record<string, string>, paymentConfig: PaymentRuntimeConfig) {
    const sign = payload.sign || "";
    if (!sign) return false;
    const appId = getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_ALIPAY_APP_ID");
    if (appId && payload.app_id !== appId) return false;
    if (normalizeText(payload.sign_type, "RSA2", 20).toUpperCase() !== "RSA2") return false;
    const content = Object.keys(payload)
        .filter((key) => key !== "sign" && key !== "sign_type" && payload[key] !== "")
        .sort()
        .map((key) => `${key}=${payload[key]}`)
        .join("&");
    return verifyRsaSha256(content, sign, loadPaymentPublicKey(paymentConfig, "VOZEB_PRO_ALIPAY_PUBLIC_KEY", "VOZEB_PRO_ALIPAY_PUBLIC_KEY_PATH"));
}

export function verifyWechatSignature(rawBody: string, headers: Headers, paymentConfig: PaymentRuntimeConfig) {
    const timestamp = headers.get("wechatpay-timestamp") || "";
    const nonce = headers.get("wechatpay-nonce") || "";
    const signature = headers.get("wechatpay-signature") || "";
    const serial = headers.get("wechatpay-serial") || "";
    if (!timestamp || !nonce || !signature || !serial) return false;
    const expectedSerial = getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_WECHAT_PAY_PLATFORM_CERT_SERIAL_NO");
    if (expectedSerial && serial !== expectedSerial) return false;
    const timestampMs = Number(timestamp) * 1000;
    if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > wechatToleranceMs(paymentConfig)) return false;
    const content = `${timestamp}\n${nonce}\n${rawBody}\n`;
    return verifyRsaSha256(content, signature, loadWechatPlatformPublicKey(paymentConfig));
}

export function decryptWechatResource(envelope: unknown, paymentConfig: PaymentRuntimeConfig) {
    const resource = readPath(envelope, "resource");
    if (!resource || typeof resource !== "object" || Array.isArray(resource)) throw new BillingInputError("微信支付回调资源缺失", 400);
    const algorithm = normalizeText(readPath(resource, "algorithm"), "", 80);
    if (algorithm !== "AEAD_AES_256_GCM") throw new BillingInputError("微信支付回调加密算法不支持", 400);
    const ciphertext = normalizeText(readPath(resource, "ciphertext"), "", 20_000);
    const nonce = normalizeText(readPath(resource, "nonce"), "", 120);
    const associatedData = normalizeText(readPath(resource, "associated_data"), "", 2000);
    const key = Buffer.from(requiredConfig(paymentConfig, "VOZEB_PRO_WECHAT_PAY_API_V3_KEY"), "utf8");
    if (key.length !== 32) throw new BillingInputError("微信支付 API v3 key 必须是 32 字节", 500);
    const encrypted = Buffer.from(ciphertext, "base64");
    if (encrypted.length <= 16) throw new BillingInputError("微信支付回调密文无效", 400);
    try {
        const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "utf8"));
        if (associatedData) decipher.setAAD(Buffer.from(associatedData, "utf8"));
        decipher.setAuthTag(encrypted.subarray(encrypted.length - 16));
        const decrypted = Buffer.concat([decipher.update(encrypted.subarray(0, encrypted.length - 16)), decipher.final()]).toString("utf8");
        return JSON.parse(decrypted) as unknown;
    } catch {
        throw new BillingInputError("微信支付回调解密失败", 400);
    }
}

function loadWechatPlatformPublicKey(paymentConfig: PaymentRuntimeConfig) {
    return loadPaymentPublicKey(paymentConfig, "VOZEB_PRO_WECHAT_PAY_PLATFORM_PUBLIC_KEY", "VOZEB_PRO_WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH", "VOZEB_PRO_WECHAT_PAY_PLATFORM_CERTIFICATE", "VOZEB_PRO_WECHAT_PAY_PLATFORM_CERTIFICATE_PATH");
}

function requiredConfig(paymentConfig: PaymentRuntimeConfig, name: string) {
    const value = getPaymentRuntimeEnv(paymentConfig, name);
    if (!value) throw new BillingInputError(`缺少支付配置：${name}`, 500);
    return value;
}

function webhookSecret(provider: string, paymentConfig: PaymentRuntimeConfig) {
    const envKey = `VOZEB_PRO_${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_WEBHOOK_SECRET`;
    return getPaymentRuntimeEnv(paymentConfig, envKey) || getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_PAYMENT_WEBHOOK_SECRET");
}

export function parseFallbackEvent(rawBody: string) {
    try {
        const payload = parseJsonPayload(rawBody);
        return {
            eventId: normalizeText(readPath(payload, "eventId") || readPath(payload, "id"), deterministicEventId("invalid", rawBody), 160),
            eventType: normalizeText(readPath(payload, "eventType") || readPath(payload, "type"), "payment.webhook", 120),
            orderId: normalizeOptionalId(readPath(payload, "orderId") || readPath(payload, "data.orderId") || readPath(payload, "metadata.orderId")),
            payload,
        };
    } catch {
        return {
            eventId: deterministicEventId("invalid", rawBody),
            eventType: "payment.webhook",
            orderId: undefined,
            payload: { rawBodyLength: rawBody.length },
        };
    }
}

function isStripeSuccessEvent(eventType: string, object: unknown) {
    if (eventType === "checkout.session.completed") return normalizeText(readPath(object, "payment_status"), "paid", 40) === "paid";
    return eventType === "payment_intent.succeeded" || eventType === "charge.succeeded";
}

function normalizeStripePaidAt(value: unknown) {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : undefined;
}

function normalizePaymentStatus(value: unknown, provider: string | undefined, paymentConfig: PaymentRuntimeConfig): WebhookStatus {
    const status = normalizeText(value, "", 40).toLowerCase();
    const configured = provider ? getPaymentRuntimeEnv(paymentConfig, `${providerEnvPrefix(provider)}_WEBHOOK_SUCCESS_STATUSES`) : "";
    const successStatuses = configured
        ? configured
              .split(",")
              .map((item) => item.trim().toLowerCase())
              .filter(Boolean)
        : ["paid", "success", "succeeded", "completed"];
    return successStatuses.includes(status) ? "succeeded" : "ignored";
}

function parseJsonPayload(rawBody: string) {
    try {
        return JSON.parse(rawBody) as unknown;
    } catch {
        throw new BillingInputError("支付回调内容不是有效 JSON", 400);
    }
}

function parseFormPayload(rawBody: string) {
    return Object.fromEntries(new URLSearchParams(rawBody).entries());
}

function readPath(source: unknown, path: string): unknown {
    return path.split(".").reduce<unknown>((current, key) => {
        if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
        return (current as Record<string, unknown>)[key];
    }, source);
}

function readConfiguredPath(paymentConfig: PaymentRuntimeConfig, payload: unknown, envName: string, defaultPaths: string[]) {
    const paths = [getPaymentRuntimeEnv(paymentConfig, envName), ...defaultPaths].filter(Boolean);
    for (const path of paths) {
        const value = readPath(payload, path);
        if (value !== undefined && value !== null && value !== "") return value;
    }
    return undefined;
}

export function normalizeProvider(value: unknown) {
    return normalizePaymentProvider(value, "custom");
}

function providerEnvPrefix(provider: string) {
    return `VOZEB_PRO_${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`;
}

function normalizeOptionalId(value: unknown) {
    const id = normalizeText(value, "", 160).replace(/[^a-zA-Z0-9_.:-]/g, "");
    return id || undefined;
}

function normalizeOptionalText(value: unknown, maxLength: number) {
    const text = normalizeText(value, "", maxLength);
    return text || undefined;
}

function normalizeText(value: unknown, fallback: string, maxLength: number) {
    const text = typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
    return (text || fallback).slice(0, maxLength);
}

function normalizeOptionalInteger(value: unknown) {
    if (value === null || value === undefined || value === "") return undefined;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.floor(number) : undefined;
}

function normalizeCurrency(value: unknown) {
    const text = normalizeText(value, "", 12).toUpperCase();
    return text || undefined;
}

function normalizeOptionalIso(value: unknown) {
    if (!value) return undefined;
    const date = new Date(typeof value === "string" || typeof value === "number" ? value : "");
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function parseAlipayDate(value: unknown) {
    const text = normalizeText(value, "", 40);
    if (!text) return undefined;
    const date = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text) ? new Date(`${text.replace(" ", "T")}+08:00`) : new Date(text);
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function yuanDecimalToCents(value: unknown) {
    const text = normalizeText(value, "", 40);
    if (!/^\d+(\.\d{1,2})?$/.test(text)) return undefined;
    const [yuan, cents = ""] = text.split(".");
    return Number(yuan) * 100 + Number(cents.padEnd(2, "0"));
}

function decodeMaybeUrlEncoded(value: unknown) {
    const text = normalizeText(value, "", 160);
    if (!text) return "";
    try {
        return decodeURIComponent(text.replace(/\+/g, "%20"));
    } catch {
        return text;
    }
}

function normalizeSignatureHeader(value: string | null) {
    const text = normalizeText(value, "", 300);
    return text.startsWith("sha256=") ? text.slice("sha256=".length) : text;
}

function safeEqual(left: string, right: string) {
    try {
        const leftBuffer = Buffer.from(left, "hex");
        const rightBuffer = Buffer.from(right, "hex");
        return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
    } catch {
        return false;
    }
}

export function deterministicEventId(provider: string, rawBody: string) {
    return `${provider}_${createHmac("sha256", "vozeb-pro-webhook-event").update(rawBody).digest("hex").slice(0, 32)}`;
}

function stripeToleranceMs(paymentConfig: PaymentRuntimeConfig) {
    const seconds = Number(getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_STRIPE_WEBHOOK_TOLERANCE_SECONDS") || 300);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 300_000;
}

function wechatToleranceMs(paymentConfig: PaymentRuntimeConfig) {
    const seconds = Number(getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_WECHAT_PAY_WEBHOOK_TOLERANCE_SECONDS") || 300);
    return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 300_000;
}

export function sanitizeJson(value: unknown, depth = 0): JsonValue {
    if (depth > 4) return "[truncated]";
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitizeJson(item, depth + 1));
    if (!value || typeof value !== "object") return {};
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .slice(0, 120)
            .map(([key, item]) => [normalizeText(key, "", 100), sanitizeJson(item, depth + 1)] as const)
            .filter(([key]) => Boolean(key)),
    ) as { [key: string]: JsonValue };
}
