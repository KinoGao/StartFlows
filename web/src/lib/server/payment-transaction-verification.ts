import { createSign, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import type { ParsedPaymentWebhook } from "@/lib/server/payment-webhook-adapters";
import { BillingInputError } from "@/lib/server/billing-errors";
import type { BillingOrderRecord, JsonValue } from "@/lib/server/database";
import { getPaymentRuntimeConfig, getPaymentRuntimeEnv, getPaymentRuntimeValue, type PaymentRuntimeConfig } from "@/lib/server/payment-config-store";
import { loadPaymentPublicKey, verifyRsaSha256 } from "@/lib/server/payment-signature-utils";
import { fetchSafeOutbound } from "@/lib/server/safe-outbound-fetch";

export type VerifiedPaymentTransaction = {
    status: "succeeded" | "pending" | "failed";
    orderId?: string;
    orderNo?: string;
    providerTradeId?: string;
    providerPaymentId?: string;
    amountCents?: number;
    currency?: string;
    paidAt?: string;
    rawPayload?: JsonValue;
};

export type PaymentVerificationResult = { verified: true; payment: VerifiedPaymentTransaction } | { verified: false; reason: string; payment?: VerifiedPaymentTransaction };

export async function verifyPaymentTransaction(provider: string, parsed: ParsedPaymentWebhook, order: BillingOrderRecord): Promise<PaymentVerificationResult> {
    const callback = normalizedPayment(parsed);
    if (paymentCompleteForOrder(callback, order)) return { verified: true, payment: callback };

    let queried: VerifiedPaymentTransaction | null = null;
    try {
        const config = await getPaymentRuntimeConfig();
        if (provider === "stripe") queried = await queryStripePayment(order, callback, config);
        else if (provider === "alipay") queried = await queryAlipayPayment(order, callback, config);
        else if (provider === "wechat") queried = await queryWechatPayment(order, config);
        else if (provider === "payply") queried = await queryPayplyPayment(order, callback, config);
    } catch (error) {
        return { verified: false, reason: error instanceof Error ? error.message.slice(0, 300) : "支付商交易查询失败", payment: callback };
    }

    const merged = mergePayment(callback, queried);
    if (!queried) return { verified: false, reason: "支付回调缺少金额、币种、交易号或订单身份，且渠道未提供交易查询能力", payment: merged };
    if (merged.status !== "succeeded") return { verified: false, reason: `支付商交易尚未成功：${merged.status}`, payment: merged };
    assertPaymentOrderIdentity(merged, order);
    if (!paymentCompleteForOrder(merged, order)) return { verified: false, reason: "支付商交易详情仍缺少金额、币种或交易号", payment: merged };
    return { verified: true, payment: merged };
}

function normalizedPayment(parsed: ParsedPaymentWebhook): VerifiedPaymentTransaction {
    return {
        status: parsed.status === "succeeded" ? "succeeded" : "pending",
        orderId: clean(parsed.orderId, 120),
        orderNo: clean(parsed.orderNo, 120),
        providerTradeId: clean(parsed.providerTradeId, 160),
        providerPaymentId: clean(parsed.providerPaymentId, 160),
        amountCents: optionalInteger(parsed.amountCents),
        currency: currency(parsed.currency),
        paidAt: optionalIso(parsed.paidAt),
        rawPayload: sanitizeJson(parsed.payload),
    };
}

function mergePayment(callback: VerifiedPaymentTransaction, queried: VerifiedPaymentTransaction | null): VerifiedPaymentTransaction {
    if (!queried) return callback;
    return {
        status: queried.status,
        orderId: queried.orderId || callback.orderId,
        orderNo: queried.orderNo || callback.orderNo,
        providerTradeId: queried.providerTradeId || callback.providerTradeId,
        providerPaymentId: queried.providerPaymentId || callback.providerPaymentId,
        amountCents: queried.amountCents ?? callback.amountCents,
        currency: queried.currency || callback.currency,
        paidAt: queried.paidAt || callback.paidAt,
        rawPayload: { callback: callback.rawPayload || {}, query: queried.rawPayload || {} },
    };
}

function paymentCompleteForOrder(payment: VerifiedPaymentTransaction, order: BillingOrderRecord) {
    try {
        assertPaymentOrderIdentity(payment, order);
    } catch {
        return false;
    }
    return payment.status === "succeeded" && payment.amountCents !== undefined && Boolean(payment.currency && (payment.providerTradeId || payment.providerPaymentId));
}

function assertPaymentOrderIdentity(payment: VerifiedPaymentTransaction, order: BillingOrderRecord) {
    const hasIdentity = Boolean(payment.orderId || payment.orderNo);
    if (!hasIdentity) throw new BillingInputError("支付交易对应的订单身份无法确认", 409);
    if (payment.orderId && payment.orderId !== order.id) throw new BillingInputError("支付交易对应的订单身份不一致", 409);
    if (payment.orderNo && payment.orderNo !== order.orderNo) throw new BillingInputError("支付交易对应的订单号不一致", 409);
    if (payment.amountCents !== undefined && payment.amountCents !== order.amountCents) throw new BillingInputError("支付金额与订单金额不一致", 409);
    if (payment.currency && payment.currency !== currency(order.currency)) throw new BillingInputError("支付币种与订单币种不一致", 409);
}

async function queryStripePayment(order: BillingOrderRecord, payment: VerifiedPaymentTransaction, config: PaymentRuntimeConfig): Promise<VerifiedPaymentTransaction | null> {
    const secret = requiredConfig(config, "VOZEB_PRO_STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY");
    const identifiers = [payment.providerTradeId, payment.providerPaymentId, order.providerPaymentId, order.providerOrderId].filter(Boolean) as string[];
    const id = identifiers.find((value) => /^(cs_|pi_|ch_)/.test(value));
    if (!id) return null;
    const path = id.startsWith("cs_")
        ? `/v1/checkout/sessions/${encodeURIComponent(id)}?expand[]=payment_intent&expand[]=payment_intent.latest_charge`
        : id.startsWith("pi_")
          ? `/v1/payment_intents/${encodeURIComponent(id)}`
          : `/v1/charges/${encodeURIComponent(id)}`;
    const response = await fetchSafeOutbound(`${stripeApiBase(config)}${path}`, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(15_000) });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new BillingInputError(readError(payload, "Stripe 交易查询失败"), response.status >= 500 ? 502 : 400);
    const object = objectValue(payload.payment_intent);
    const status = stripeStatus(payload, object);
    return {
        status,
        orderId: clean(readPath(payload, "metadata.orderId") || readPath(payload, "metadata.vozebProOrderId") || readPath(object, "metadata.orderId") || readPath(object, "metadata.vozebProOrderId") || payload.client_reference_id, 120),
        orderNo: clean(readPath(payload, "metadata.orderNo") || readPath(payload, "metadata.vozebProOrderNo") || readPath(object, "metadata.orderNo") || readPath(object, "metadata.vozebProOrderNo"), 120),
        providerTradeId: clean(readPath(object, "id") || payload.payment_intent || (String(payload.id || "").startsWith("pi_") ? payload.id : undefined) || payload.id, 160),
        providerPaymentId: clean(readPath(object, "latest_charge") || payload.latest_charge || (String(payload.id || "").startsWith("ch_") ? payload.id : undefined), 160),
        amountCents: optionalInteger(payload.amount_total ?? payload.amount_received ?? payload.amount ?? object.amount_received ?? object.amount),
        currency: currency(payload.currency ?? object.currency),
        paidAt: stripeTimestamp(payload.created ?? object.created),
        rawPayload: sanitizeJson(payload),
    };
}

async function queryAlipayPayment(order: BillingOrderRecord, payment: VerifiedPaymentTransaction, config: PaymentRuntimeConfig): Promise<VerifiedPaymentTransaction> {
    const appId = requiredConfig(config, "VOZEB_PRO_ALIPAY_APP_ID");
    const privateKey = loadPrivateKey(config, "VOZEB_PRO_ALIPAY_PRIVATE_KEY", "VOZEB_PRO_ALIPAY_PRIVATE_KEY_PATH");
    const gateway = getPaymentRuntimeEnv(config, "VOZEB_PRO_ALIPAY_GATEWAY_URL") || "https://openapi.alipay.com/gateway.do";
    const bizContent: Record<string, string> = { out_trade_no: order.orderNo };
    const tradeNo = clean(payment.providerTradeId || payment.providerPaymentId, 160);
    if (tradeNo && !tradeNo.includes(":")) bizContent.trade_no = tradeNo;
    const params: Record<string, string> = {
        app_id: appId,
        method: "alipay.trade.query",
        charset: "utf-8",
        sign_type: "RSA2",
        timestamp: alipayTimestamp(),
        version: "1.0",
        biz_content: JSON.stringify(bizContent),
    };
    params.sign = signAlipayParams(params, privateKey);
    const response = await fetchSafeOutbound(gateway, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params), signal: AbortSignal.timeout(15_000) });
    const raw = await response.text();
    const payload = parseJsonObject(raw);
    const result = objectValue(payload.alipay_trade_query_response);
    if (!response.ok || String(result.code || "") !== "10000") throw new BillingInputError(readError(result, "支付宝交易查询失败"), response.status >= 500 ? 502 : 400);
    const sign = clean(payload.sign, 2000);
    const signContent = extractJsonObjectValue(raw, "alipay_trade_query_response");
    if (!sign || !signContent || !verifyRsaSha256(signContent, sign, loadPaymentPublicKey(config, "VOZEB_PRO_ALIPAY_PUBLIC_KEY", "VOZEB_PRO_ALIPAY_PUBLIC_KEY_PATH"))) throw new BillingInputError("支付宝交易查询响应验签失败", 502);
    const tradeStatus = String(result.trade_status || "").toUpperCase();
    return {
        status: tradeStatus === "TRADE_SUCCESS" || tradeStatus === "TRADE_FINISHED" ? "succeeded" : tradeStatus === "TRADE_CLOSED" ? "failed" : "pending",
        orderNo: clean(result.out_trade_no, 120),
        providerTradeId: clean(result.trade_no, 160),
        providerPaymentId: clean(result.trade_no, 160),
        amountCents: decimalToCents(result.total_amount),
        currency: "CNY",
        paidAt: optionalIso(result.send_pay_date),
        rawPayload: sanitizeJson(payload),
    };
}

async function queryWechatPayment(order: BillingOrderRecord, config: PaymentRuntimeConfig): Promise<VerifiedPaymentTransaction> {
    const mchid = requiredConfig(config, "VOZEB_PRO_WECHAT_PAY_MCH_ID");
    const serialNo = requiredConfig(config, "VOZEB_PRO_WECHAT_PAY_CERT_SERIAL_NO");
    const privateKey = loadPrivateKey(config, "VOZEB_PRO_WECHAT_PAY_PRIVATE_KEY", "VOZEB_PRO_WECHAT_PAY_PRIVATE_KEY_PATH");
    const apiBase = (getPaymentRuntimeEnv(config, "VOZEB_PRO_WECHAT_PAY_API_BASE") || "https://api.mch.weixin.qq.com").replace(/\/+$/, "");
    const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(order.orderNo)}?mchid=${encodeURIComponent(mchid)}`;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(16).toString("hex");
    const signature = signWechatRequest("GET", path, timestamp, nonce, "", privateKey);
    const response = await fetchSafeOutbound(`${apiBase}${path}`, {
        headers: { authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`, accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
    });
    const raw = await response.text();
    const payload = parseJsonObject(raw);
    if (!response.ok) throw new BillingInputError(readError(payload, "微信支付交易查询失败"), response.status >= 500 ? 502 : 400);
    if (!verifyWechatResponse(raw, response.headers, config)) throw new BillingInputError("微信支付交易查询响应验签失败", 502);
    const tradeState = String(payload.trade_state || "").toUpperCase();
    return {
        status: tradeState === "SUCCESS" ? "succeeded" : ["CLOSED", "PAYERROR", "REVOKED"].includes(tradeState) ? "failed" : "pending",
        orderNo: clean(payload.out_trade_no, 120),
        providerTradeId: clean(payload.transaction_id, 160),
        providerPaymentId: clean(payload.transaction_id, 160),
        amountCents: optionalInteger(readPath(payload, "amount.payer_total") ?? readPath(payload, "amount.total")),
        currency: currency(readPath(payload, "amount.payer_currency") || readPath(payload, "amount.currency") || "CNY"),
        paidAt: optionalIso(payload.success_time),
        rawPayload: sanitizeJson(payload),
    };
}

async function queryPayplyPayment(order: BillingOrderRecord, payment: VerifiedPaymentTransaction, config: PaymentRuntimeConfig): Promise<VerifiedPaymentTransaction | null> {
    const template = getPaymentRuntimeValue(config, "VOZEB_PRO_PAYPLY_QUERY_URL", "PAYPLY_QUERY_URL");
    if (!template) return null;
    const apiKey = requiredConfig(config, "VOZEB_PRO_PAYPLY_API_KEY", "PAYPLY_API_KEY");
    const values = {
        orderId: order.id,
        orderNo: order.orderNo,
        providerOrderId: order.providerOrderId || "",
        providerTradeId: payment.providerTradeId || "",
        providerPaymentId: payment.providerPaymentId || order.providerPaymentId || "",
    };
    const url = renderTemplate(template, values);
    const customHeader = getPaymentRuntimeEnv(config, "VOZEB_PRO_PAYPLY_API_KEY_HEADER");
    const headers: Record<string, string> = customHeader ? { [customHeader]: apiKey } : { authorization: `Bearer ${apiKey}`, "x-api-key": apiKey };
    const response = await fetchSafeOutbound(url, { headers, signal: AbortSignal.timeout(15_000) });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new BillingInputError(readError(payload, "PayPly 交易查询失败"), response.status >= 500 ? 502 : 400);
    const status = String(readConfiguredPath(config, payload, "VOZEB_PRO_PAYPLY_QUERY_STATUS_FIELD", ["status", "tradeStatus", "paymentStatus", "data.status", "data.tradeStatus"]) || "").toLowerCase();
    return {
        status: ["success", "succeeded", "paid", "completed", "ok"].includes(status) ? "succeeded" : ["failed", "closed", "cancelled", "canceled"].includes(status) ? "failed" : "pending",
        orderId: clean(readConfiguredPath(config, payload, "VOZEB_PRO_PAYPLY_QUERY_ORDER_ID_FIELD", ["orderId", "data.orderId", "metadata.orderId"]), 120),
        orderNo: clean(readConfiguredPath(config, payload, "VOZEB_PRO_PAYPLY_QUERY_ORDER_NO_FIELD", ["orderNo", "outTradeNo", "out_trade_no", "data.orderNo"]), 120),
        providerTradeId: clean(readConfiguredPath(config, payload, "VOZEB_PRO_PAYPLY_QUERY_TRADE_ID_FIELD", ["providerTradeId", "tradeId", "trade_no", "transactionId", "data.tradeId"]), 160),
        providerPaymentId: clean(readConfiguredPath(config, payload, "VOZEB_PRO_PAYPLY_QUERY_PAYMENT_ID_FIELD", ["providerPaymentId", "paymentId", "payment_id", "transactionId", "data.paymentId"]), 160),
        amountCents:
            optionalInteger(readConfiguredPath(config, payload, "VOZEB_PRO_PAYPLY_QUERY_AMOUNT_CENTS_FIELD", ["amountCents", "data.amountCents"])) ??
            decimalToCents(readConfiguredPath(config, payload, "VOZEB_PRO_PAYPLY_QUERY_AMOUNT_FIELD", ["amount", "totalAmount", "data.amount"])),
        currency: currency(readConfiguredPath(config, payload, "VOZEB_PRO_PAYPLY_QUERY_CURRENCY_FIELD", ["currency", "data.currency"])),
        paidAt: optionalIso(readConfiguredPath(config, payload, "VOZEB_PRO_PAYPLY_QUERY_PAID_AT_FIELD", ["paidAt", "successTime", "data.paidAt"])),
        rawPayload: sanitizeJson(payload),
    };
}

function stripeStatus(payload: Record<string, unknown>, paymentIntent: Record<string, unknown>): VerifiedPaymentTransaction["status"] {
    const paymentStatus = String(payload.payment_status || "").toLowerCase();
    const status = String(paymentIntent.status || payload.status || "").toLowerCase();
    if (paymentStatus === "paid" || status === "succeeded") return "succeeded";
    if (["canceled", "requires_payment_method"].includes(status) || (paymentStatus === "unpaid" && status === "expired")) return "failed";
    return "pending";
}

function verifyWechatResponse(raw: string, headers: Headers, config: PaymentRuntimeConfig) {
    const timestamp = headers.get("wechatpay-timestamp") || "";
    const nonce = headers.get("wechatpay-nonce") || "";
    const signature = headers.get("wechatpay-signature") || "";
    if (!timestamp || !nonce || !signature) return false;
    return verifyRsaSha256(`${timestamp}\n${nonce}\n${raw}\n`, signature, loadPaymentPublicKey(config, "VOZEB_PRO_WECHAT_PAY_PLATFORM_PUBLIC_KEY", "VOZEB_PRO_WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH"));
}

function loadPrivateKey(config: PaymentRuntimeConfig, valueName: string, pathName: string) {
    const value = getPaymentRuntimeEnv(config, valueName);
    const text = value || (getPaymentRuntimeEnv(config, pathName) ? readFileSync(getPaymentRuntimeEnv(config, pathName), "utf8") : "");
    if (!text) throw new BillingInputError(`缺少支付私钥配置：${valueName}`, 500);
    const normalized = text.replace(/\\n/g, "\n").trim();
    return normalized.includes("-----BEGIN") ? normalized : `-----BEGIN PRIVATE KEY-----\n${normalized.match(/.{1,64}/g)?.join("\n") || normalized}\n-----END PRIVATE KEY-----`;
}

function signAlipayParams(params: Record<string, string>, privateKey: string) {
    const content = Object.keys(params)
        .filter((key) => key !== "sign" && params[key] !== "")
        .sort()
        .map((key) => `${key}=${params[key]}`)
        .join("&");
    return createSign("RSA-SHA256").update(content, "utf8").sign(privateKey, "base64");
}

function signWechatRequest(method: string, path: string, timestamp: string, nonce: string, body: string, privateKey: string) {
    return createSign("RSA-SHA256").update(`${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`, "utf8").sign(privateKey, "base64");
}

function extractJsonObjectValue(rawBody: string, key: string) {
    const keyIndex = rawBody.indexOf(JSON.stringify(key));
    if (keyIndex < 0) return "";
    const separatorIndex = rawBody.indexOf(":", keyIndex + key.length + 2);
    if (separatorIndex < 0) return "";
    let start = separatorIndex + 1;
    while (/\s/.test(rawBody[start] || "")) start += 1;
    if (rawBody[start] !== "{") return "";
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < rawBody.length; index += 1) {
        const character = rawBody[index];
        if (inString) {
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === '"') inString = false;
        } else if (character === '"') inString = true;
        else if (character === "{") depth += 1;
        else if (character === "}" && --depth === 0) return rawBody.slice(start, index + 1);
    }
    return "";
}

function readConfiguredPath(config: PaymentRuntimeConfig, payload: unknown, envName: string, defaults: string[]) {
    for (const path of [getPaymentRuntimeEnv(config, envName), ...defaults].filter(Boolean)) {
        const value = readPath(payload, path);
        if (value !== undefined && value !== null && value !== "") return value;
    }
    return undefined;
}

function readPath(source: unknown, path: string): unknown {
    return path.split(".").reduce<unknown>((value, key) => (value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)[key] : undefined), source);
}

function objectValue(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function parseJsonObject(value: string) {
    try {
        return objectValue(JSON.parse(value));
    } catch {
        return {};
    }
}

function requiredConfig(config: PaymentRuntimeConfig, ...names: string[]) {
    const value = getPaymentRuntimeValue(config, ...names);
    if (!value) throw new BillingInputError(`缺少支付配置：${names[0]}`, 500);
    return value;
}

function stripeApiBase(config: PaymentRuntimeConfig) {
    return (getPaymentRuntimeEnv(config, "VOZEB_PRO_STRIPE_API_BASE") || "https://api.stripe.com").replace(/\/+$/, "");
}

function alipayTimestamp(date = new Date()) {
    const parts = new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(date);
    const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function renderTemplate(template: string, values: Record<string, string>) {
    return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => values[key] || "");
}

function stripeTimestamp(value: unknown) {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : undefined;
}

function optionalIso(value: unknown) {
    if (value === undefined || value === null || value === "") return undefined;
    const date = new Date(String(value));
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function optionalInteger(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.round(number) : undefined;
}

function decimalToCents(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : undefined;
}

function currency(value: unknown) {
    const result = clean(value, 12)?.toUpperCase();
    return result || undefined;
}

function clean(value: unknown, maxLength: number) {
    const text = typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim();
    return text ? text.slice(0, maxLength) : undefined;
}

function readError(payload: Record<string, unknown>, fallback: string) {
    return clean(readPath(payload, "error.message") || payload.message || payload.sub_msg || payload.msg || payload.code, 300) || fallback;
}

function sanitizeJson(value: unknown, depth = 0): JsonValue {
    if (depth > 4) return "[truncated]";
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
    if (Array.isArray(value)) return value.slice(0, 80).map((item) => sanitizeJson(item, depth + 1));
    if (!value || typeof value !== "object") return {};
    return Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .slice(0, 120)
            .map(([key, item]) => [key.slice(0, 100), sanitizeJson(item, depth + 1)]),
    );
}
