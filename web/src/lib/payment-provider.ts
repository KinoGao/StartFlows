const PAYMENT_PROVIDER_ALIASES: Record<string, string> = {
    "stripe-checkout": "stripe",
    ali: "alipay",
    "alipay-page": "alipay",
    wxpay: "wechat",
    wechatpay: "wechat",
    weixin: "wechat",
    "pay-ply": "payply",
    pay_ply: "payply",
};

export function normalizePaymentProvider(value: unknown, fallback = "manual") {
    const provider = (typeof value === "string" ? value : value === null || value === undefined ? "" : String(value))
        .trim()
        .slice(0, 60)
        .toLowerCase()
        .replace(/[^a-z0-9_.:-]/g, "");
    return PAYMENT_PROVIDER_ALIASES[provider] || provider || fallback;
}
