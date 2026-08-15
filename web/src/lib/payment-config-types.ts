export type PaymentProviderId = "stripe" | "alipay" | "wechat" | "payply" | "manual";

export const ALIPAY_PAYMENT_MODES = ["official", "face_to_face"] as const;
export type AlipayPaymentMode = (typeof ALIPAY_PAYMENT_MODES)[number];
export const DEFAULT_ALIPAY_PAYMENT_MODE: AlipayPaymentMode = "official";

const ALIPAY_PAYMENT_MODE_PRESENTATIONS: Record<AlipayPaymentMode, { description: string; checkoutKind: string }> = {
    official: { description: "支付宝官方电脑网站支付，创建订单后跳转支付宝收银台。", checkoutKind: "官方支付表单" },
    face_to_face: { description: "支付宝当面付，创建订单后向用户展示扫码二维码。", checkoutKind: "当面付二维码" },
};

export function isAlipayPaymentMode(value: unknown): value is AlipayPaymentMode {
    return typeof value === "string" && ALIPAY_PAYMENT_MODES.includes(value as AlipayPaymentMode);
}

export function getAlipayPaymentModePresentation(value: unknown) {
    return isAlipayPaymentMode(value) ? ALIPAY_PAYMENT_MODE_PRESENTATIONS[value] : undefined;
}

type PaymentConfigFieldKind = "text" | "url" | "secret" | "textarea" | "select";

export type PaymentProviderConfigField = {
    key: string;
    label: string;
    kind: PaymentConfigFieldKind;
    envNames: string[];
    required?: boolean;
    any?: boolean;
    secret?: boolean;
    advanced?: boolean;
    placeholder?: string;
    note?: string;
    defaultValue?: string;
    options?: Array<{ label: string; value: string }>;
};

export type PaymentConfigRequirement = {
    label: string;
    envNames: string[];
    configured: boolean;
    note?: string;
};

export type PaymentProviderConfig = {
    id: PaymentProviderId;
    name: string;
    description: string;
    checkoutKind: string;
    checkoutReady: boolean;
    webhookReady: boolean;
    ready: boolean;
    enabled: boolean;
    sourceLabel: string;
    webhookOptional?: boolean;
    webhookPath: string;
    webhookUrl: string;
    fields: Array<PaymentProviderConfigField & { configured: boolean; value?: string; sourceLabel: string }>;
    checkoutRequirements: PaymentConfigRequirement[];
    webhookRequirements: PaymentConfigRequirement[];
    optionalEnvNames: string[];
};

export type PaymentConfigSummary = {
    origin: string;
    readyProviders: number;
    providers: PaymentProviderConfig[];
    generatedAt: string;
};

export type PaymentProviderDefinition = {
    id: PaymentProviderId;
    name: string;
    description: string;
    checkoutKind: string;
    webhookOptional?: boolean;
    checkoutFieldKeys: string[];
    webhookFieldKeys: string[];
    fields: PaymentProviderConfigField[];
};

export type SavedPaymentProviderConfig = {
    enabled: boolean;
    values: Record<string, string>;
};

export type SavedPaymentConfig = {
    providers: Partial<Record<PaymentProviderId, SavedPaymentProviderConfig>>;
};

export const PAYMENT_PROVIDER_DEFINITIONS: PaymentProviderDefinition[] = [
    {
        id: "stripe",
        name: "Stripe Checkout",
        description: "适合国际银行卡、Apple Pay、Google Pay 等支付场景。",
        checkoutKind: "跳转支付页",
        checkoutFieldKeys: ["secretKey"],
        webhookFieldKeys: ["webhookSecret"],
        fields: [
            { key: "secretKey", label: "Secret Key", kind: "secret", secret: true, required: true, envNames: ["VOZEB_PRO_STRIPE_SECRET_KEY", "STRIPE_SECRET_KEY"], placeholder: "sk_live_..." },
            { key: "webhookSecret", label: "Webhook 签名密钥", kind: "secret", secret: true, required: true, envNames: ["VOZEB_PRO_STRIPE_WEBHOOK_SECRET", "STRIPE_WEBHOOK_SECRET"], placeholder: "whsec_..." },
            { key: "successUrl", label: "支付成功返回地址", kind: "url", envNames: ["VOZEB_PRO_STRIPE_SUCCESS_URL"], placeholder: "默认 /billing/success", advanced: true },
            { key: "cancelUrl", label: "取消支付返回地址", kind: "url", envNames: ["VOZEB_PRO_STRIPE_CANCEL_URL"], placeholder: "默认 /billing/cancel", advanced: true },
            { key: "apiBase", label: "Stripe API Base", kind: "url", envNames: ["VOZEB_PRO_STRIPE_API_BASE"], placeholder: "https://api.stripe.com", advanced: true },
            { key: "paymentMethodTypes", label: "支付方式类型", kind: "text", envNames: ["VOZEB_PRO_STRIPE_PAYMENT_METHOD_TYPES"], placeholder: "card,alipay", note: "留空时由 Stripe Checkout 默认决定。", advanced: true },
            { key: "webhookToleranceSeconds", label: "回调时间容差秒数", kind: "text", envNames: ["VOZEB_PRO_STRIPE_WEBHOOK_TOLERANCE_SECONDS"], placeholder: "300", advanced: true },
        ],
    },
    {
        id: "alipay",
        name: "支付宝",
        description: "支持支付宝官方支付与当面付，两种接入方式只能选择一种。",
        checkoutKind: "官方支付 / 当面付",
        checkoutFieldKeys: ["mode", "appId", "privateKey"],
        webhookFieldKeys: ["appId", "publicKey"],
        fields: [
            {
                key: "mode",
                label: "接入方式",
                kind: "select",
                required: true,
                defaultValue: DEFAULT_ALIPAY_PAYMENT_MODE,
                envNames: ["VOZEB_PRO_ALIPAY_MODE"],
                options: [
                    { label: "官方支付", value: "official" },
                    { label: "当面付", value: "face_to_face" },
                ],
                note: "官方支付跳转支付宝电脑网站；当面付生成支付宝扫码二维码。保存时只会启用当前选择的一种方式。",
            },
            { key: "appId", label: "应用 App ID", kind: "text", required: true, envNames: ["VOZEB_PRO_ALIPAY_APP_ID"], placeholder: "2026..." },
            {
                key: "privateKey",
                label: "应用私钥",
                kind: "textarea",
                secret: true,
                required: true,
                any: true,
                envNames: ["VOZEB_PRO_ALIPAY_PRIVATE_KEY", "VOZEB_PRO_ALIPAY_PRIVATE_KEY_PATH"],
                placeholder: "可粘贴私钥内容；服务器路径建议仍放环境变量。",
                note: "后台保存的是私钥内容；如使用文件路径，可继续使用环境变量。",
            },
            { key: "publicKey", label: "支付宝公钥", kind: "textarea", secret: true, required: true, any: true, envNames: ["VOZEB_PRO_ALIPAY_PUBLIC_KEY", "VOZEB_PRO_ALIPAY_PUBLIC_KEY_PATH"], placeholder: "支付宝开放平台公钥" },
            { key: "gatewayUrl", label: "网关地址", kind: "url", envNames: ["VOZEB_PRO_ALIPAY_GATEWAY_URL"], placeholder: "https://openapi.alipay.com/gateway.do", advanced: true },
            { key: "notifyUrl", label: "异步回调地址", kind: "url", envNames: ["VOZEB_PRO_ALIPAY_NOTIFY_URL"], placeholder: "默认 /api/billing/webhooks/alipay", advanced: true },
            { key: "returnUrl", label: "同步返回地址", kind: "url", envNames: ["VOZEB_PRO_ALIPAY_RETURN_URL"], placeholder: "默认 /billing/success", advanced: true },
        ],
    },
    {
        id: "wechat",
        name: "微信支付",
        description: "适合微信支付 v3 Native 二维码收款。",
        checkoutKind: "Native 二维码",
        checkoutFieldKeys: ["appId", "mchId", "certSerialNo", "privateKey"],
        webhookFieldKeys: ["apiV3Key", "platformPublicKey"],
        fields: [
            { key: "appId", label: "App ID", kind: "text", required: true, envNames: ["VOZEB_PRO_WECHAT_PAY_APP_ID"], placeholder: "wx..." },
            { key: "mchId", label: "商户号", kind: "text", required: true, envNames: ["VOZEB_PRO_WECHAT_PAY_MCH_ID"], placeholder: "商户平台 mch_id" },
            { key: "certSerialNo", label: "商户证书序列号", kind: "text", required: true, envNames: ["VOZEB_PRO_WECHAT_PAY_CERT_SERIAL_NO"], placeholder: "证书序列号" },
            {
                key: "privateKey",
                label: "商户私钥",
                kind: "textarea",
                secret: true,
                required: true,
                any: true,
                envNames: ["VOZEB_PRO_WECHAT_PAY_PRIVATE_KEY", "VOZEB_PRO_WECHAT_PAY_PRIVATE_KEY_PATH"],
                placeholder: "可粘贴 API 证书私钥；服务器路径建议仍放环境变量。",
            },
            { key: "apiV3Key", label: "API v3 Key", kind: "secret", secret: true, required: true, envNames: ["VOZEB_PRO_WECHAT_PAY_API_V3_KEY"], placeholder: "32 字节密钥" },
            {
                key: "platformPublicKey",
                label: "平台公钥 / 证书",
                kind: "textarea",
                secret: true,
                required: true,
                any: true,
                envNames: ["VOZEB_PRO_WECHAT_PAY_PLATFORM_PUBLIC_KEY", "VOZEB_PRO_WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH", "VOZEB_PRO_WECHAT_PAY_PLATFORM_CERTIFICATE", "VOZEB_PRO_WECHAT_PAY_PLATFORM_CERTIFICATE_PATH"],
                placeholder: "微信支付平台公钥或平台证书",
            },
            { key: "platformCertSerialNo", label: "平台证书序列号", kind: "text", envNames: ["VOZEB_PRO_WECHAT_PAY_PLATFORM_CERT_SERIAL_NO"], placeholder: "可选", advanced: true },
            { key: "apiBase", label: "微信支付 API Base", kind: "url", envNames: ["VOZEB_PRO_WECHAT_PAY_API_BASE"], placeholder: "https://api.mch.weixin.qq.com", advanced: true },
            { key: "notifyUrl", label: "支付回调地址", kind: "url", envNames: ["VOZEB_PRO_WECHAT_PAY_NOTIFY_URL"], placeholder: "默认 /api/billing/webhooks/wechat", advanced: true },
            { key: "refundNotifyUrl", label: "退款回调地址", kind: "url", envNames: ["VOZEB_PRO_WECHAT_PAY_REFUND_NOTIFY_URL"], placeholder: "可选，默认不单独接收退款回调", advanced: true },
            { key: "webhookToleranceSeconds", label: "回调时间容差秒数", kind: "text", envNames: ["VOZEB_PRO_WECHAT_PAY_WEBHOOK_TOLERANCE_SECONDS"], placeholder: "300", advanced: true },
        ],
    },
    {
        id: "payply",
        name: "PayPly",
        description: "适合自定义 PayPly 支付接口，部署者自行配置下单地址、密钥和返回字段。",
        checkoutKind: "自定义链接/二维码/表单",
        checkoutFieldKeys: ["checkoutUrl", "apiKey"],
        webhookFieldKeys: ["webhookSecret"],
        fields: [
            { key: "checkoutUrl", label: "下单接口地址", kind: "url", required: true, any: true, envNames: ["VOZEB_PRO_PAYPLY_CHECKOUT_URL", "PAYPLY_CHECKOUT_URL"], placeholder: "https://pay.example.com/api/create" },
            { key: "apiKey", label: "接口密钥", kind: "secret", secret: true, required: true, any: true, envNames: ["VOZEB_PRO_PAYPLY_API_KEY", "PAYPLY_API_KEY"], placeholder: "PayPly API Key" },
            {
                key: "webhookSecret",
                label: "回调验签密钥",
                kind: "secret",
                secret: true,
                required: true,
                any: true,
                envNames: ["VOZEB_PRO_PAYPLY_WEBHOOK_SECRET", "VOZEB_PRO_PAYMENT_WEBHOOK_SECRET"],
                placeholder: "用于校验 x-vozeb-pro-signature / x-signature",
            },
            { key: "merchantId", label: "商户号", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_MERCHANT_ID"], placeholder: "可选" },
            {
                key: "requestMethod",
                label: "请求方式",
                kind: "select",
                envNames: ["VOZEB_PRO_PAYPLY_REQUEST_METHOD", "PAYPLY_REQUEST_METHOD"],
                placeholder: "POST",
                options: [
                    { label: "POST", value: "POST" },
                    { label: "GET", value: "GET" },
                ],
            },
            {
                key: "contentType",
                label: "请求格式",
                kind: "select",
                envNames: ["VOZEB_PRO_PAYPLY_CONTENT_TYPE", "PAYPLY_CONTENT_TYPE"],
                placeholder: "application/json",
                options: [
                    { label: "JSON", value: "application/json" },
                    { label: "表单", value: "application/x-www-form-urlencoded" },
                ],
            },
            { key: "extraHeaders", label: "额外请求头", kind: "textarea", envNames: ["VOZEB_PRO_PAYPLY_EXTRA_HEADERS", "PAYPLY_EXTRA_HEADERS"], placeholder: '{"x-channel":"vozeb-pro"}', note: "填写 JSON 对象，值会随下单请求发送。", advanced: true },
            {
                key: "requestTemplate",
                label: "下单请求体模板",
                kind: "textarea",
                envNames: ["VOZEB_PRO_PAYPLY_REQUEST_TEMPLATE", "PAYPLY_REQUEST_TEMPLATE"],
                placeholder: '{"order_no":"{{orderNo}}","amount":"{{amount}}","notify_url":"{{notifyUrl}}"}',
                note: "留空使用平台默认字段；支持 {{orderId}}、{{orderNo}}、{{amount}}、{{amountCents}}、{{currency}}、{{notifyUrl}}、{{returnUrl}}、{{cancelUrl}} 等变量。",
                advanced: true,
            },
            { key: "notifyUrl", label: "回调地址", kind: "url", envNames: ["VOZEB_PRO_PAYPLY_NOTIFY_URL"], placeholder: "默认 /api/billing/webhooks/payply" },
            { key: "returnUrl", label: "支付成功返回", kind: "url", envNames: ["VOZEB_PRO_PAYPLY_RETURN_URL"], placeholder: "默认 /billing/success" },
            { key: "cancelUrl", label: "取消支付返回", kind: "url", envNames: ["VOZEB_PRO_PAYPLY_CANCEL_URL"], placeholder: "默认 /billing/cancel" },
            {
                key: "resultKind",
                label: "返回类型",
                kind: "select",
                envNames: ["VOZEB_PRO_PAYPLY_RESULT_KIND"],
                placeholder: "自动识别",
                options: [
                    { label: "自动识别", value: "" },
                    { label: "跳转链接", value: "redirect" },
                    { label: "二维码内容", value: "qr" },
                    { label: "表单 HTML", value: "form" },
                ],
                advanced: true,
            },
            { key: "apiKeyHeader", label: "密钥请求头", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_API_KEY_HEADER"], placeholder: "默认 Authorization + x-api-key", advanced: true },
            { key: "urlField", label: "支付链接字段", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_URL_FIELD"], placeholder: "data.paymentUrl", advanced: true },
            { key: "qrField", label: "二维码字段", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_QR_FIELD"], placeholder: "data.qrCode", advanced: true },
            { key: "formField", label: "表单 HTML 字段", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_FORM_FIELD"], placeholder: "data.formHtml", advanced: true },
            { key: "providerOrderIdField", label: "支付商订单号字段", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_PROVIDER_ORDER_ID_FIELD"], placeholder: "data.tradeId", advanced: true },
            { key: "providerPaymentIdField", label: "支付流水字段", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_PROVIDER_PAYMENT_ID_FIELD"], placeholder: "data.paymentId", advanced: true },
            { key: "expiresAtField", label: "过期时间字段", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_EXPIRES_AT_FIELD"], placeholder: "data.expiresAt", advanced: true },
            {
                key: "refundUrl",
                label: "退款接口地址",
                kind: "url",
                envNames: ["VOZEB_PRO_PAYPLY_REFUND_URL", "PAYPLY_REFUND_URL"],
                placeholder: "https://pay.example.com/api/refund",
                note: "未配置时后台不会直接标记 PayPly 订单为已退款。",
                advanced: true,
            },
            {
                key: "refundRequestMethod",
                label: "退款请求方式",
                kind: "select",
                envNames: ["VOZEB_PRO_PAYPLY_REFUND_REQUEST_METHOD", "PAYPLY_REFUND_REQUEST_METHOD"],
                placeholder: "POST",
                options: [
                    { label: "POST", value: "POST" },
                    { label: "GET", value: "GET" },
                ],
                advanced: true,
            },
            {
                key: "refundContentType",
                label: "退款请求格式",
                kind: "select",
                envNames: ["VOZEB_PRO_PAYPLY_REFUND_CONTENT_TYPE", "PAYPLY_REFUND_CONTENT_TYPE"],
                placeholder: "application/json",
                options: [
                    { label: "JSON", value: "application/json" },
                    { label: "表单", value: "application/x-www-form-urlencoded" },
                ],
                advanced: true,
            },
            {
                key: "refundExtraHeaders",
                label: "退款额外请求头",
                kind: "textarea",
                envNames: ["VOZEB_PRO_PAYPLY_REFUND_EXTRA_HEADERS", "PAYPLY_REFUND_EXTRA_HEADERS"],
                placeholder: '{"x-refund-channel":"vozeb-pro"}',
                note: "填写 JSON 对象，只随退款请求发送。",
                advanced: true,
            },
            {
                key: "refundRequestTemplate",
                label: "退款请求体模板",
                kind: "textarea",
                envNames: ["VOZEB_PRO_PAYPLY_REFUND_REQUEST_TEMPLATE", "PAYPLY_REFUND_REQUEST_TEMPLATE"],
                placeholder: '{"order_no":"{{orderNo}}","payment_id":"{{providerPaymentId}}","amount":"{{amount}}","reason":"{{reason}}"}',
                note: "留空使用平台默认字段；支持 {{orderId}}、{{orderNo}}、{{providerOrderId}}、{{providerPaymentId}}、{{amount}}、{{amountCents}}、{{currency}}、{{reason}} 等变量。",
                advanced: true,
            },
            { key: "refundIdField", label: "退款单号字段", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_REFUND_ID_FIELD"], placeholder: "data.refundId", advanced: true },
            { key: "refundStatusField", label: "退款状态字段", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_REFUND_STATUS_FIELD"], placeholder: "data.status", advanced: true },
            { key: "refundSuccessStatuses", label: "退款成功状态值", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_REFUND_SUCCESS_STATUSES"], placeholder: "refunded,success,succeeded", advanced: true },
            { key: "webhookSignatureHeader", label: "回调签名请求头", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_WEBHOOK_SIGNATURE_HEADER"], placeholder: "x-vozeb-pro-signature", advanced: true },
            { key: "webhookEventIdField", label: "回调事件 ID 字段", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_WEBHOOK_EVENT_ID_FIELD"], placeholder: "data.id", advanced: true },
            { key: "webhookEventTypeField", label: "回调事件类型字段", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_WEBHOOK_EVENT_TYPE_FIELD"], placeholder: "data.type", advanced: true },
            { key: "webhookStatusField", label: "回调状态字段", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_WEBHOOK_STATUS_FIELD"], placeholder: "data.status", advanced: true },
            { key: "webhookOrderIdField", label: "站内订单 ID 字段", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_WEBHOOK_ORDER_ID_FIELD"], placeholder: "metadata.vozebProOrderId", advanced: true },
            { key: "webhookOrderNoField", label: "站内订单号字段", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_WEBHOOK_ORDER_NO_FIELD"], placeholder: "metadata.vozebProOrderNo", advanced: true },
            { key: "webhookSuccessStatuses", label: "成功状态值", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_WEBHOOK_SUCCESS_STATUSES"], placeholder: "paid,success,succeeded", advanced: true },
            { key: "webhookTradeIdField", label: "交易号字段", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_WEBHOOK_TRADE_ID_FIELD"], placeholder: "data.tradeId", advanced: true },
            { key: "webhookPaymentIdField", label: "支付流水字段", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_WEBHOOK_PAYMENT_ID_FIELD"], placeholder: "data.paymentId", advanced: true },
            { key: "webhookAmountCentsField", label: "金额分字段", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_WEBHOOK_AMOUNT_CENTS_FIELD"], placeholder: "data.amountCents", advanced: true },
            { key: "webhookAmountYuanField", label: "金额元字段", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_WEBHOOK_AMOUNT_YUAN_FIELD"], placeholder: "data.amount", advanced: true },
            { key: "webhookCurrencyField", label: "币种字段", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_WEBHOOK_CURRENCY_FIELD"], placeholder: "data.currency", advanced: true },
            { key: "webhookPaidAtField", label: "支付时间字段", kind: "text", envNames: ["VOZEB_PRO_PAYPLY_WEBHOOK_PAID_AT_FIELD"], placeholder: "data.paidAt", advanced: true },
        ],
    },
    {
        id: "manual",
        name: "人工确认",
        description: "无需第三方密钥，适合测试、线下转账或管理员人工核销。",
        checkoutKind: "后台人工确认",
        webhookOptional: true,
        checkoutFieldKeys: [],
        webhookFieldKeys: ["customWebhookSecret"],
        fields: [{ key: "customWebhookSecret", label: "自定义回调密钥", kind: "secret", secret: true, envNames: ["VOZEB_PRO_PAYMENT_WEBHOOK_SECRET"], placeholder: "仅自定义支付商回调需要填写。", note: "人工确认本身不需要密钥。" }],
    },
];
