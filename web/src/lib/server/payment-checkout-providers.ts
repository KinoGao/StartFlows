import { createSign, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

import { DEFAULT_ALIPAY_PAYMENT_MODE, isAlipayPaymentMode } from "@/lib/payment-config-types";
import { normalizePaymentProvider } from "@/lib/payment-provider";
import { BillingInputError } from "@/lib/server/billing-errors";
import { getPaymentRuntimeEnv, getPaymentRuntimeValue, type PaymentRuntimeConfig } from "@/lib/server/payment-config-store";
import type { BillingOrderRecord, JsonValue } from "@/lib/server/database";
import { loadPaymentPublicKey, verifyRsaSha256 } from "@/lib/server/payment-signature-utils";
import { fetchSafeOutbound } from "@/lib/server/safe-outbound-fetch";
import type { CreatePaymentCheckoutOptions, PaymentCheckoutKind, PaymentCheckoutResult } from "./payment-checkout-types";
import { normalizePaymentForm, type PaymentForm } from "./payment-form";

export async function createProviderCheckout(provider: string, order: BillingOrderRecord, options: CreatePaymentCheckoutOptions, paymentConfig: PaymentRuntimeConfig): Promise<PaymentCheckoutResult> {
    if (provider === "stripe") return createStripeCheckout(order, options, paymentConfig);
    if (provider === "alipay") return createAlipayCheckout(order, options, paymentConfig);
    if (provider === "wechat") return createWechatNativeCheckout(order, options, paymentConfig);
    if (provider === "payply") return createPayplyCheckout(order, options, paymentConfig);
    if (provider === "manual" || provider === "custom") return createManualCheckout(provider, order);
    throw new BillingInputError("暂不支持该支付渠道", 400);
}

function createManualCheckout(provider: string, order: BillingOrderRecord): PaymentCheckoutResult {
    return {
        provider,
        orderId: order.id,
        orderNo: order.orderNo,
        kind: "manual",
        providerOrderId: order.orderNo,
        expiresAt: order.expiresAt,
    };
}

async function createStripeCheckout(order: BillingOrderRecord, options: CreatePaymentCheckoutOptions, paymentConfig: PaymentRuntimeConfig): Promise<PaymentCheckoutResult> {
    const secretKey = requiredConfig(paymentConfig, "VOZEB_PRO_STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY");
    const origin = resolveOrigin(options.origin);
    const successUrl = getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_STRIPE_SUCCESS_URL") || `${origin}/billing/success?orderId=${encodeURIComponent(order.id)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_STRIPE_CANCEL_URL") || `${origin}/billing/cancel?orderId=${encodeURIComponent(order.id)}`;
    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("client_reference_id", order.id);
    params.set("success_url", successUrl);
    params.set("cancel_url", cancelUrl);
    params.set("line_items[0][quantity]", "1");
    params.set("line_items[0][price_data][currency]", order.currency.toLowerCase());
    params.set("line_items[0][price_data][unit_amount]", String(order.amountCents));
    params.set("line_items[0][price_data][product_data][name]", order.subject);
    params.set("metadata[orderId]", order.id);
    params.set("metadata[orderNo]", order.orderNo);
    params.set("metadata[vozebProOrderId]", order.id);
    params.set("metadata[vozebProOrderNo]", order.orderNo);
    params.set("payment_intent_data[metadata][orderId]", order.id);
    params.set("payment_intent_data[metadata][orderNo]", order.orderNo);
    params.set("payment_intent_data[metadata][vozebProOrderId]", order.id);
    params.set("payment_intent_data[metadata][vozebProOrderNo]", order.orderNo);
    for (const method of stripePaymentMethods(paymentConfig)) params.append("payment_method_types[]", method);

    const response = await fetchSafeOutbound(`${stripeApiBase(paymentConfig)}/v1/checkout/sessions`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${secretKey}`,
            "content-type": "application/x-www-form-urlencoded",
            "Idempotency-Key": `vozeb-pro-checkout-${order.id}`,
        },
        body: params,
        signal: AbortSignal.timeout(20_000),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new BillingInputError(readStripeError(payload), response.status >= 500 ? 502 : 400);

    const sessionId = normalizeText(payload.id, "", 160);
    const url = normalizeText(payload.url, "", 2000);
    if (!sessionId || !url) throw new BillingInputError("Stripe 未返回有效支付链接", 502);
    return {
        provider: "stripe",
        orderId: order.id,
        orderNo: order.orderNo,
        kind: "redirect",
        url,
        providerOrderId: sessionId,
        providerPaymentId: normalizeOptionalText(payload.payment_intent, 160),
        expiresAt: normalizeStripeExpiresAt(payload.expires_at) || order.expiresAt,
    };
}

async function createAlipayCheckout(order: BillingOrderRecord, options: CreatePaymentCheckoutOptions, paymentConfig: PaymentRuntimeConfig): Promise<PaymentCheckoutResult> {
    if (order.currency.toUpperCase() !== "CNY") throw new BillingInputError("支付宝仅支持人民币 CNY 订单", 400);
    const appId = requiredConfig(paymentConfig, "VOZEB_PRO_ALIPAY_APP_ID");
    const privateKey = loadPrivateKey(paymentConfig, "VOZEB_PRO_ALIPAY_PRIVATE_KEY", "VOZEB_PRO_ALIPAY_PRIVATE_KEY_PATH");
    const origin = resolveOrigin(options.origin);
    const gateway = getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_ALIPAY_GATEWAY_URL") || "https://openapi.alipay.com/gateway.do";
    const modeValue = getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_ALIPAY_MODE") || DEFAULT_ALIPAY_PAYMENT_MODE;
    if (!isAlipayPaymentMode(modeValue)) throw new BillingInputError("支付宝接入方式配置无效", 500);
    const params: Record<string, string> = {
        app_id: appId,
        method: modeValue === "face_to_face" ? "alipay.trade.precreate" : "alipay.trade.page.pay",
        charset: "utf-8",
        sign_type: "RSA2",
        timestamp: alipayTimestamp(),
        version: "1.0",
        notify_url: getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_ALIPAY_NOTIFY_URL") || `${origin}/api/billing/webhooks/alipay`,
        biz_content: JSON.stringify({
            out_trade_no: order.orderNo,
            total_amount: centsToDecimal(order.amountCents),
            subject: order.subject,
            product_code: modeValue === "face_to_face" ? "FACE_TO_FACE_PAYMENT" : "FAST_INSTANT_TRADE_PAY",
            passback_params: order.id,
        }),
    };
    if (modeValue === "official") params.return_url = getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_ALIPAY_RETURN_URL") || `${origin}/billing/success?orderId=${encodeURIComponent(order.id)}`;
    params.sign = signAlipayParams(params, privateKey);
    if (modeValue === "face_to_face") return createAlipayFaceToFaceCheckout(gateway, params, order, paymentConfig);
    return {
        provider: "alipay",
        orderId: order.id,
        orderNo: order.orderNo,
        kind: "form",
        url: `${gateway}?${new URLSearchParams(params).toString()}`,
        form: buildPaymentForm(gateway, params),
        providerOrderId: order.orderNo,
        expiresAt: order.expiresAt,
    };
}

async function createAlipayFaceToFaceCheckout(gateway: string, params: Record<string, string>, order: BillingOrderRecord, paymentConfig: PaymentRuntimeConfig): Promise<PaymentCheckoutResult> {
    const response = await fetchSafeOutbound(gateway, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(params),
        signal: AbortSignal.timeout(20_000),
    });
    const rawBody = await response.text();
    const payload = parseJsonObject(rawBody);
    const result = readPath(payload, "alipay_trade_precreate_response");
    const resultObject = result && typeof result === "object" && !Array.isArray(result) ? (result as Record<string, unknown>) : {};
    if (!response.ok) {
        throw new BillingInputError(readAlipayPrecreateError(payload), response.status >= 500 ? 502 : 400);
    }
    const resultCode = normalizeText(resultObject.code, "", 20);
    if (!resultCode) throw new BillingInputError("支付宝当面付返回格式无效", 502);
    if (resultCode !== "10000") throw new BillingInputError(readAlipayPrecreateError(payload), 400);
    const responseSign = normalizeText(payload.sign, "", 2000);
    const signContent = extractJsonObjectValue(rawBody, "alipay_trade_precreate_response");
    const publicKey = loadPaymentPublicKey(paymentConfig, "VOZEB_PRO_ALIPAY_PUBLIC_KEY", "VOZEB_PRO_ALIPAY_PUBLIC_KEY_PATH");
    if (!responseSign || !signContent || !verifyRsaSha256(signContent, responseSign, publicKey)) throw new BillingInputError("支付宝当面付响应验签失败", 502);
    const responseOrderNo = normalizeText(resultObject.out_trade_no, "", 160);
    if (!responseOrderNo || responseOrderNo !== order.orderNo) throw new BillingInputError("支付宝当面付返回的订单号不匹配", 502);
    const qrCode = normalizeText(resultObject.qr_code, "", 2000);
    if (!qrCode) throw new BillingInputError("支付宝当面付未返回有效二维码", 502);
    return {
        provider: "alipay",
        orderId: order.id,
        orderNo: order.orderNo,
        kind: "qr",
        url: qrCode,
        qrContent: qrCode,
        providerOrderId: responseOrderNo,
        providerPaymentId: normalizeOptionalText(resultObject.trade_no, 160),
        expiresAt: order.expiresAt,
    };
}

function parseJsonObject(value: string) {
    try {
        const parsed = JSON.parse(value) as unknown;
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
        return {};
    }
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
            continue;
        }
        if (character === '"') inString = true;
        else if (character === "{") depth += 1;
        else if (character === "}" && --depth === 0) return rawBody.slice(start, index + 1);
    }
    return "";
}

async function createWechatNativeCheckout(order: BillingOrderRecord, options: CreatePaymentCheckoutOptions, paymentConfig: PaymentRuntimeConfig): Promise<PaymentCheckoutResult> {
    const appid = requiredConfig(paymentConfig, "VOZEB_PRO_WECHAT_PAY_APP_ID");
    const mchid = requiredConfig(paymentConfig, "VOZEB_PRO_WECHAT_PAY_MCH_ID");
    const serialNo = requiredConfig(paymentConfig, "VOZEB_PRO_WECHAT_PAY_CERT_SERIAL_NO");
    const privateKey = loadPrivateKey(paymentConfig, "VOZEB_PRO_WECHAT_PAY_PRIVATE_KEY", "VOZEB_PRO_WECHAT_PAY_PRIVATE_KEY_PATH");
    const origin = resolveOrigin(options.origin);
    const body = JSON.stringify({
        appid,
        mchid,
        description: order.subject.slice(0, 127),
        out_trade_no: order.orderNo,
        time_expire: order.expiresAt,
        notify_url: getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_WECHAT_PAY_NOTIFY_URL") || `${origin}/api/billing/webhooks/wechat`,
        amount: {
            total: order.amountCents,
            currency: order.currency,
        },
    });
    const apiBase = (getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_WECHAT_PAY_API_BASE") || "https://api.mch.weixin.qq.com").replace(/\/+$/, "");
    const path = "/v3/pay/transactions/native";
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = randomBytes(16).toString("hex");
    const signature = signWechatRequest("POST", path, timestamp, nonce, body, privateKey);
    const response = await fetchSafeOutbound(`${apiBase}${path}`, {
        method: "POST",
        headers: {
            authorization: `WECHATPAY2-SHA256-RSA2048 mchid="${mchid}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${serialNo}",signature="${signature}"`,
            accept: "application/json",
            "content-type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(20_000),
    });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new BillingInputError(readWechatError(payload), response.status >= 500 ? 502 : 400);
    const codeUrl = normalizeText(payload.code_url, "", 2000);
    if (!codeUrl) throw new BillingInputError("微信支付未返回有效二维码链接", 502);
    return {
        provider: "wechat",
        orderId: order.id,
        orderNo: order.orderNo,
        kind: "qr",
        qrContent: codeUrl,
        providerOrderId: order.orderNo,
        expiresAt: order.expiresAt,
    };
}

async function createPayplyCheckout(order: BillingOrderRecord, options: CreatePaymentCheckoutOptions, paymentConfig: PaymentRuntimeConfig): Promise<PaymentCheckoutResult> {
    const checkoutUrl = requiredConfig(paymentConfig, "VOZEB_PRO_PAYPLY_CHECKOUT_URL", "PAYPLY_CHECKOUT_URL");
    const apiKey = requiredConfig(paymentConfig, "VOZEB_PRO_PAYPLY_API_KEY", "PAYPLY_API_KEY");
    const origin = resolveOrigin(options.origin);
    const notifyUrl = getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_PAYPLY_NOTIFY_URL") || `${origin}/api/billing/webhooks/payply`;
    const returnUrl = getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_PAYPLY_RETURN_URL") || `${origin}/billing/success?orderId=${encodeURIComponent(order.id)}`;
    const cancelUrl = getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_PAYPLY_CANCEL_URL") || `${origin}/billing/cancel?orderId=${encodeURIComponent(order.id)}`;
    const body = buildPayplyCheckoutPayload(paymentConfig, order, {
        merchantId: getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_PAYPLY_MERCHANT_ID") || undefined,
        orderId: order.id,
        orderNo: order.orderNo,
        subject: order.subject,
        amountCents: order.amountCents,
        amount: centsToDecimal(order.amountCents),
        currency: order.currency,
        notifyUrl,
        returnUrl,
        cancelUrl,
        metadata: {
            vozebProOrderId: order.id,
            vozebProOrderNo: order.orderNo,
            productId: order.productId || "",
            userId: order.userId || "",
        },
    });
    const requestMethod = payplyRequestMethod(paymentConfig);
    const contentType = payplyContentType(paymentConfig);
    const request = buildPayplyRequest(checkoutUrl, requestMethod, contentType, body, payplyHeaders(paymentConfig, apiKey, contentType));
    const response = await fetchSafeOutbound(request.url, { ...request.init, signal: AbortSignal.timeout(20_000) });
    const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) throw new BillingInputError(readPayplyError(payload), response.status >= 500 ? 502 : 400);

    const forcedKind = normalizeCheckoutKind(getPaymentRuntimeEnv(paymentConfig, "VOZEB_PRO_PAYPLY_RESULT_KIND"));
    const form = normalizePaymentForm(readConfiguredPath(paymentConfig, payload, "VOZEB_PRO_PAYPLY_FORM_FIELD", ["form", "formHtml", "html", "data.form", "data.formHtml", "data.html", "result.form", "result.formHtml"]), checkoutUrl);
    const qrContent = normalizeOptionalText(readConfiguredPath(paymentConfig, payload, "VOZEB_PRO_PAYPLY_QR_FIELD", ["qrContent", "qrCode", "qrcode", "codeUrl", "code_url", "data.qrContent", "data.qrCode", "data.codeUrl", "result.qrContent"]), 4000);
    const url = normalizeOptionalText(
        readConfiguredPath(paymentConfig, payload, "VOZEB_PRO_PAYPLY_URL_FIELD", ["url", "paymentUrl", "payment_url", "checkoutUrl", "checkout_url", "payUrl", "pay_url", "data.url", "data.paymentUrl", "data.payUrl", "result.url"]),
        2000,
    );
    const kind = forcedKind || (form ? "form" : qrContent ? "qr" : url ? "redirect" : undefined);
    if (!kind || (kind === "form" && !form) || (kind === "qr" && !qrContent) || (kind === "redirect" && !url)) throw new BillingInputError("PayPly 未返回有效支付参数", 502);
    return {
        provider: "payply",
        orderId: order.id,
        orderNo: order.orderNo,
        kind,
        url,
        form,
        qrContent,
        providerOrderId:
            normalizeOptionalText(readConfiguredPath(paymentConfig, payload, "VOZEB_PRO_PAYPLY_PROVIDER_ORDER_ID_FIELD", ["providerOrderId", "tradeId", "trade_no", "id", "data.providerOrderId", "data.tradeId", "data.id", "result.id"]), 160) ||
            order.orderNo,
        providerPaymentId: normalizeOptionalText(
            readConfiguredPath(paymentConfig, payload, "VOZEB_PRO_PAYPLY_PROVIDER_PAYMENT_ID_FIELD", ["providerPaymentId", "paymentId", "payment_id", "transactionId", "data.providerPaymentId", "data.paymentId", "data.transactionId"]),
            160,
        ),
        expiresAt: normalizeOptionalIso(readConfiguredPath(paymentConfig, payload, "VOZEB_PRO_PAYPLY_EXPIRES_AT_FIELD", ["expiresAt", "expireAt", "expiredAt", "data.expiresAt", "data.expireAt"])) || order.expiresAt,
    };
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
    const message = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`;
    return createSign("RSA-SHA256").update(message, "utf8").sign(privateKey, "base64");
}

function buildPaymentForm(action: string, params: Record<string, string>): PaymentForm {
    return { action, method: "POST", fields: Object.entries(params).map(([name, value]) => ({ name, value })) };
}

export function checkoutMetadata(checkout: PaymentCheckoutResult): JsonValue {
    return {
        provider: checkout.provider,
        kind: checkout.kind,
        url: checkout.url || "",
        form: checkout.form || null,
        qrContent: checkout.qrContent || "",
        providerOrderId: checkout.providerOrderId || "",
        providerPaymentId: checkout.providerPaymentId || "",
        expiresAt: checkout.expiresAt || "",
        generatedAt: new Date().toISOString(),
    };
}

export function checkoutFromMetadata(order: BillingOrderRecord, provider: string): PaymentCheckoutResult | null {
    const metadata = order.metadata && typeof order.metadata === "object" && !Array.isArray(order.metadata) ? order.metadata : {};
    const value = metadata.checkout;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const item = value as Record<string, JsonValue>;
    const storedProvider = normalizeProvider(item.provider);
    const kind = item.kind === "redirect" || item.kind === "form" || item.kind === "qr" ? item.kind : item.kind === "manual" ? "manual" : null;
    const expiresAt = normalizeOptionalText(item.expiresAt, 80);
    if (storedProvider !== provider || !kind || (expiresAt && Date.parse(expiresAt) <= Date.now())) return null;
    const result: PaymentCheckoutResult = {
        provider,
        orderId: order.id,
        orderNo: order.orderNo,
        kind,
        url: normalizeOptionalText(item.url, 2000),
        form: normalizePaymentForm(item.form),
        qrContent: normalizeOptionalText(item.qrContent, 4000),
        providerOrderId: normalizeOptionalText(item.providerOrderId, 160),
        providerPaymentId: normalizeOptionalText(item.providerPaymentId, 160),
        expiresAt,
    };
    if ((kind === "redirect" && !result.url) || (kind === "form" && !result.form) || (kind === "qr" && !result.qrContent && !result.url)) return null;
    return result;
}

export function mergeMetadata(current: JsonValue | undefined, patch: Record<string, JsonValue>): JsonValue {
    return { ...objectMetadata(current), ...patch };
}

function objectMetadata(value: JsonValue | undefined) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, JsonValue>) : {};
}

function resolveOrigin(value?: string) {
    return (process.env.NEXT_PUBLIC_SITE_URL?.trim() || value || "http://localhost:3000").replace(/\/+$/, "");
}

function requiredConfig(config: PaymentRuntimeConfig, ...names: string[]) {
    const value = getPaymentRuntimeValue(config, ...names);
    if (!value) throw new BillingInputError(`缺少支付配置：${names[0]}`, 500);
    return value;
}

function loadPrivateKey(config: PaymentRuntimeConfig, valueEnv: string, pathEnv: string) {
    const value = getPaymentRuntimeEnv(config, valueEnv);
    if (value) return normalizePrivateKey(value);
    const path = getPaymentRuntimeEnv(config, pathEnv);
    if (path) return normalizePrivateKey(readFileSync(path, "utf8"));
    throw new BillingInputError(`缺少支付私钥配置：${valueEnv}`, 500);
}

function normalizePrivateKey(value: string) {
    const text = value.replace(/\\n/g, "\n").trim();
    if (text.includes("-----BEGIN")) return text;
    return `-----BEGIN PRIVATE KEY-----\n${text.match(/.{1,64}/g)?.join("\n") || text}\n-----END PRIVATE KEY-----`;
}

function stripeApiBase(config: PaymentRuntimeConfig) {
    return (getPaymentRuntimeEnv(config, "VOZEB_PRO_STRIPE_API_BASE") || "https://api.stripe.com").replace(/\/+$/, "");
}

function stripePaymentMethods(config: PaymentRuntimeConfig) {
    return getPaymentRuntimeEnv(config, "VOZEB_PRO_STRIPE_PAYMENT_METHOD_TYPES")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function readStripeError(payload: Record<string, unknown>) {
    const error = payload.error && typeof payload.error === "object" ? (payload.error as Record<string, unknown>) : {};
    return normalizeText(error.message, "Stripe 下单失败", 300);
}

function readWechatError(payload: Record<string, unknown>) {
    return normalizeText(payload.message || payload.code, "微信支付下单失败", 300);
}

function readAlipayPrecreateError(payload: Record<string, unknown>) {
    const result = readPath(payload, "alipay_trade_precreate_response");
    const item = result && typeof result === "object" && !Array.isArray(result) ? (result as Record<string, unknown>) : {};
    return normalizeText(item.sub_msg || item.msg || item.sub_code || item.code || readPath(payload, "message"), "支付宝当面付下单失败", 300);
}

function readPayplyError(payload: Record<string, unknown>) {
    return normalizeText(readPath(payload, "message") || readPath(payload, "error.message") || readPath(payload, "error") || readPath(payload, "data.message"), "PayPly 下单失败", 300);
}

function buildPayplyCheckoutPayload(config: PaymentRuntimeConfig, order: BillingOrderRecord, defaultPayload: Record<string, unknown>) {
    const template = getPaymentRuntimeEnv(config, "VOZEB_PRO_PAYPLY_REQUEST_TEMPLATE") || getPaymentRuntimeEnv(config, "PAYPLY_REQUEST_TEMPLATE");
    if (!template) return defaultPayload;
    const rendered = renderPayplyTemplate(template, {
        orderId: order.id,
        orderNo: order.orderNo,
        subject: order.subject,
        amountCents: String(order.amountCents),
        amount: centsToDecimal(order.amountCents),
        currency: order.currency,
        notifyUrl: String(defaultPayload.notifyUrl || ""),
        returnUrl: String(defaultPayload.returnUrl || ""),
        cancelUrl: String(defaultPayload.cancelUrl || ""),
        merchantId: String(defaultPayload.merchantId || ""),
        productId: order.productId || "",
        userId: order.userId || "",
    });
    try {
        const payload = JSON.parse(rendered) as unknown;
        return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : defaultPayload;
    } catch {
        return defaultPayload;
    }
}

function renderPayplyTemplate(template: string, values: Record<string, string>) {
    return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => values[key] ?? "");
}

function payplyRequestMethod(config: PaymentRuntimeConfig) {
    const method = (getPaymentRuntimeEnv(config, "VOZEB_PRO_PAYPLY_REQUEST_METHOD") || getPaymentRuntimeEnv(config, "PAYPLY_REQUEST_METHOD") || "POST").toUpperCase();
    return method === "GET" ? "GET" : "POST";
}

function payplyContentType(config: PaymentRuntimeConfig) {
    const contentType = getPaymentRuntimeEnv(config, "VOZEB_PRO_PAYPLY_CONTENT_TYPE") || getPaymentRuntimeEnv(config, "PAYPLY_CONTENT_TYPE") || "application/json";
    return contentType === "application/x-www-form-urlencoded" ? contentType : "application/json";
}

function buildPayplyRequest(checkoutUrl: string, method: "GET" | "POST", contentType: string, body: Record<string, unknown>, headers: Record<string, string>) {
    if (method === "GET") {
        const url = new URL(checkoutUrl);
        for (const [key, value] of Object.entries(body)) {
            if (value === undefined || value === null || typeof value === "object") continue;
            url.searchParams.set(key, String(value));
        }
        return { url: url.toString(), init: { method, headers } };
    }
    return {
        url: checkoutUrl,
        init: {
            method,
            headers,
            body: contentType === "application/x-www-form-urlencoded" ? new URLSearchParams(flattenPayplyBody(body)).toString() : JSON.stringify(body),
        },
    };
}

function flattenPayplyBody(body: Record<string, unknown>) {
    return Object.fromEntries(
        Object.entries(body)
            .filter(([, value]) => value !== undefined && value !== null && typeof value !== "object")
            .map(([key, value]) => [key, String(value)]),
    );
}

function payplyHeaders(config: PaymentRuntimeConfig, apiKey: string, contentType: string) {
    const customHeader = getPaymentRuntimeEnv(config, "VOZEB_PRO_PAYPLY_API_KEY_HEADER");
    const headers: Record<string, string> = {
        "content-type": contentType,
    };
    if (customHeader) {
        headers[customHeader] = apiKey;
    } else {
        headers.authorization = `Bearer ${apiKey}`;
        headers["x-api-key"] = apiKey;
    }
    for (const [key, value] of Object.entries(parsePayplyExtraHeaders(config))) {
        if (key && value) headers[key] = value;
    }
    return headers;
}

function parsePayplyExtraHeaders(config: PaymentRuntimeConfig): Record<string, string> {
    const text = getPaymentRuntimeEnv(config, "VOZEB_PRO_PAYPLY_EXTRA_HEADERS") || getPaymentRuntimeEnv(config, "PAYPLY_EXTRA_HEADERS");
    if (!text) return {};
    try {
        const value = JSON.parse(text) as unknown;
        if (!value || typeof value !== "object" || Array.isArray(value)) return {};
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .map(([key, item]) => [key.trim(), normalizeText(item, "", 1000)])
                .filter(([key, item]) => Boolean(key && item)),
        );
    } catch {
        return {};
    }
}

function readConfiguredPath(config: PaymentRuntimeConfig, payload: unknown, envName: string, defaultPaths: string[]) {
    const paths = [getPaymentRuntimeEnv(config, envName), ...defaultPaths].filter(Boolean);
    for (const path of paths) {
        const value = readPath(payload, path);
        if (value !== undefined && value !== null && value !== "") return value;
    }
    return undefined;
}

function readPath(source: unknown, path: string): unknown {
    return path.split(".").reduce<unknown>((current, key) => {
        if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
        return (current as Record<string, unknown>)[key];
    }, source);
}

function normalizeCheckoutKind(value: unknown): Exclude<PaymentCheckoutKind, "manual"> | undefined {
    const kind = normalizeText(value, "", 20).toLowerCase();
    return kind === "redirect" || kind === "form" || kind === "qr" ? kind : undefined;
}

function centsToDecimal(cents: number) {
    return (cents / 100).toFixed(2);
}

function alipayTimestamp(date = new Date()) {
    const formatter = new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

function normalizeStripeExpiresAt(value: unknown) {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : undefined;
}

function normalizeOptionalIso(value: unknown) {
    if (!value) return undefined;
    const date = new Date(typeof value === "string" || typeof value === "number" ? value : "");
    return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

export function normalizeId(value: unknown) {
    return normalizeText(value, "", 120).replace(/[^a-zA-Z0-9_.:-]/g, "");
}

export function normalizeProvider(value: unknown) {
    return normalizePaymentProvider(value);
}

function normalizeText(value: unknown, fallback: string, maxLength: number) {
    const text = typeof value === "string" ? value.trim() : value === null || value === undefined ? "" : String(value).trim();
    return (text || fallback).slice(0, maxLength);
}

function normalizeOptionalText(value: unknown, maxLength: number) {
    const text = normalizeText(value, "", maxLength);
    return text || undefined;
}
