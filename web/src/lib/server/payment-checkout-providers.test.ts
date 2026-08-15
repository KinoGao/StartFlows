import { createSign, createVerify, generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/safe-outbound-fetch", () => ({ fetchSafeOutbound: (url: string | URL, init?: RequestInit) => fetch(url, init) }));

import type { BillingOrderRecord } from "@/lib/server/database";
import type { PaymentRuntimeConfig } from "@/lib/server/payment-config-store";
import { checkoutFromMetadata, checkoutMetadata, createProviderCheckout } from "./payment-checkout-providers";

const order = {
    id: "order-one",
    orderNo: "VZ001",
    productId: "product",
    userId: "user",
    productKind: "plan",
    planId: "pro",
    status: "pending",
    subject: "Pro",
    listAmountCents: 1299,
    promotionDiscountCents: 0,
    couponDiscountCents: 0,
    amountCents: 1299,
    currency: "USD",
    pointsAmount: 100,
    dailyPoints: 20,
    periodDays: 30,
    quantity: 1,
    provider: "stripe",
    expiresAt: "2099-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
} satisfies BillingOrderRecord;

const config: PaymentRuntimeConfig = {
    saved: { providers: {} },
    providers: {},
    valuesByEnvName: {
        VOZEB_PRO_STRIPE_SECRET_KEY: "sk_test_secret",
        VOZEB_PRO_STRIPE_API_BASE: "https://stripe.test",
    },
};

const alipayKeyPair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const alipayPrivateKey = alipayKeyPair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const alipayPublicKey = alipayKeyPair.publicKey.export({ type: "spki", format: "pem" }).toString();

describe("payment checkout providers", () => {
    beforeEach(() => vi.unstubAllGlobals());

    it("uses a stable Stripe idempotency key for one local order", async () => {
        const fetchMock = vi.fn(async () => Response.json({ id: "cs_test_session", url: "https://checkout.stripe.test/session", expires_at: 4070908800 }));
        vi.stubGlobal("fetch", fetchMock);

        await createProviderCheckout("stripe", order, { origin: "https://app.test" }, config);

        expect(fetchMock).toHaveBeenCalledWith(
            "https://stripe.test/v1/checkout/sessions",
            expect.objectContaining({
                headers: expect.objectContaining({ "Idempotency-Key": "vozeb-pro-checkout-order-one" }),
            }),
        );
    });

    it("restores a reusable checkout result from order metadata", () => {
        const checkout = {
            provider: "stripe",
            orderId: order.id,
            orderNo: order.orderNo,
            kind: "redirect" as const,
            url: "https://checkout.stripe.test/session",
            providerOrderId: "cs_test_session",
            expiresAt: "2099-01-01T00:00:00.000Z",
        };

        expect(checkoutFromMetadata({ ...order, metadata: { checkout: checkoutMetadata(checkout) } }, "stripe")).toEqual(checkout);
    });

    it("uses the Alipay official page-pay flow by default", async () => {
        const checkout = await createProviderCheckout("alipay", { ...order, provider: "alipay", currency: "CNY" }, { origin: "https://app.test" }, alipayConfig());
        const params = new URL(checkout.url || "").searchParams;

        expect(checkout).toMatchObject({ provider: "alipay", kind: "form", providerOrderId: order.orderNo });
        expect(params.get("method")).toBe("alipay.trade.page.pay");
        expect(params.get("return_url")).toBe(`https://app.test/billing/success?orderId=${order.id}`);
        expect(JSON.parse(params.get("biz_content") || "{}")).toMatchObject({ out_trade_no: order.orderNo, total_amount: "12.99", product_code: "FAST_INSTANT_TRADE_PAY" });
    });

    it("creates an Alipay face-to-face QR checkout", async () => {
        const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) =>
            signedAlipayResponse({
                alipay_trade_precreate_response: {
                    code: "10000",
                    msg: "Success",
                    out_trade_no: order.orderNo,
                    qr_code: "https://qr.alipay.test/order-one",
                },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        const checkout = await createProviderCheckout("alipay", { ...order, provider: "alipay", currency: "CNY" }, { origin: "https://app.test" }, alipayConfig("face_to_face"));

        expect(checkout).toMatchObject({ provider: "alipay", kind: "qr", qrContent: "https://qr.alipay.test/order-one", url: "https://qr.alipay.test/order-one", providerOrderId: order.orderNo });
        expect(fetchMock).toHaveBeenCalledWith("https://alipay.test/gateway.do", expect.objectContaining({ method: "POST", headers: expect.objectContaining({ "content-type": "application/x-www-form-urlencoded" }) }));
        const body = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
        expect(body.get("method")).toBe("alipay.trade.precreate");
        expect(body.get("notify_url")).toBe("https://app.test/api/billing/webhooks/alipay");
        expect(body.has("return_url")).toBe(false);
        expect(JSON.parse(body.get("biz_content") || "{}")).toMatchObject({ out_trade_no: order.orderNo, total_amount: "12.99", product_code: "FACE_TO_FACE_PAYMENT" });
        expect(verifyAlipayRequestSignature(body)).toBe(true);
    });

    it("returns the Alipay business error for a rejected face-to-face order", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({
                    alipay_trade_precreate_response: { code: "40004", msg: "Business Failed", sub_code: "ACQ.INVALID_PARAMETER", sub_msg: "订单参数无效" },
                }),
            ),
        );

        await expect(createProviderCheckout("alipay", { ...order, provider: "alipay", currency: "CNY" }, {}, alipayConfig("face_to_face"))).rejects.toThrow("订单参数无效");
    });

    it("rejects a successful Alipay response without a QR code", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => signedAlipayResponse({ alipay_trade_precreate_response: { code: "10000", msg: "Success", out_trade_no: order.orderNo } })),
        );

        await expect(createProviderCheckout("alipay", { ...order, provider: "alipay", currency: "CNY" }, {}, alipayConfig("face_to_face"))).rejects.toThrow("支付宝当面付未返回有效二维码");
    });

    it("rejects a face-to-face QR response for another merchant order", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => signedAlipayResponse({ alipay_trade_precreate_response: { code: "10000", msg: "Success", out_trade_no: "VZ-OTHER", qr_code: "https://qr.alipay.test/other" } })),
        );

        await expect(createProviderCheckout("alipay", { ...order, provider: "alipay", currency: "CNY" }, {}, alipayConfig("face_to_face"))).rejects.toThrow("支付宝当面付返回的订单号不匹配");
    });

    it("rejects non-CNY Alipay orders before sending an upstream request", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        await expect(createProviderCheckout("alipay", { ...order, provider: "alipay", currency: "USD" }, {}, alipayConfig("face_to_face"))).rejects.toThrow("支付宝仅支持人民币 CNY 订单");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects an Alipay face-to-face response changed after signing", async () => {
        const response = signedAlipayResponse({ alipay_trade_precreate_response: { code: "10000", msg: "Success", out_trade_no: order.orderNo, qr_code: "https://qr.alipay.test/order-one" } });
        const rawBody = (await response.text()).replace("order-one", "changed-order");
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(rawBody, { headers: { "content-type": "application/json" } })),
        );

        await expect(createProviderCheckout("alipay", { ...order, provider: "alipay", currency: "CNY" }, {}, alipayConfig("face_to_face"))).rejects.toThrow("支付宝当面付响应验签失败");
    });
});

function alipayConfig(mode = "official"): PaymentRuntimeConfig {
    return {
        saved: { providers: {} },
        providers: { alipay: { enabled: true, saved: true } },
        valuesByEnvName: {
            VOZEB_PRO_ALIPAY_MODE: mode,
            VOZEB_PRO_ALIPAY_APP_ID: "2026000000000000",
            VOZEB_PRO_ALIPAY_PRIVATE_KEY: alipayPrivateKey,
            VOZEB_PRO_ALIPAY_PUBLIC_KEY: alipayPublicKey,
            VOZEB_PRO_ALIPAY_GATEWAY_URL: "https://alipay.test/gateway.do",
        },
    };
}

function signedAlipayResponse(payload: { alipay_trade_precreate_response: Record<string, unknown> }) {
    const signContent = JSON.stringify(payload.alipay_trade_precreate_response);
    const sign = createSign("RSA-SHA256").update(signContent, "utf8").sign(alipayPrivateKey, "base64");
    return new Response(JSON.stringify({ ...payload, sign }), { headers: { "content-type": "application/json" } });
}

function verifyAlipayRequestSignature(body: URLSearchParams) {
    const content = [...body.entries()]
        .filter(([key, value]) => key !== "sign" && value !== "")
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${value}`)
        .join("&");
    return createVerify("RSA-SHA256")
        .update(content, "utf8")
        .verify(alipayKeyPair.publicKey, body.get("sign") || "", "base64");
}
