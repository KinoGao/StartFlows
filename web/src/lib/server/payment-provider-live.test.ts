import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BillingOrderRecord, PaymentTransactionRecord } from "@/lib/server/database";
import type { PaymentRuntimeConfig } from "@/lib/server/payment-config-store";
import { createPaymentFixtureServer } from "../../../scripts/payment-fixture-server.mjs";

type RuntimeFixture = {
    saved: { providers: Record<string, unknown> };
    providers: Record<string, { enabled?: boolean; saved?: boolean }>;
    valuesByEnvName: Record<string, string>;
};

const mocks = vi.hoisted(() => ({
    runtimeConfig: { saved: { providers: {} }, providers: {}, valuesByEnvName: {} } as RuntimeFixture,
}));

vi.mock("@/lib/server/payment-config-store", () => ({
    getPaymentRuntimeConfig: vi.fn(async () => mocks.runtimeConfig),
    getPaymentRuntimeEnv: (config: RuntimeFixture, name: string) => config.valuesByEnvName[name]?.trim() || "",
    getPaymentRuntimeValue: (config: RuntimeFixture, ...names: string[]) => names.map((name) => config.valuesByEnvName[name]?.trim() || "").find(Boolean) || "",
}));

import { createProviderCheckout } from "./payment-checkout-providers";
import { refundPaymentTransaction } from "./payment-refund-service";

const alipayKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const alipayPrivateKey = alipayKeys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const alipayPublicKey = alipayKeys.publicKey.export({ type: "spki", format: "pem" }).toString();
const wechatPrivateKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const wechatPlatformKeys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const wechatPlatformPrivateKey = wechatPlatformKeys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const wechatPlatformPublicKey = wechatPlatformKeys.publicKey.export({ type: "spki", format: "pem" }).toString();

const order = {
    id: "order-live",
    orderNo: "VZ-LIVE-001",
    productId: "product-live",
    userId: "user-live",
    productKind: "plan",
    planId: "pro",
    status: "paid",
    subject: "Pro plan",
    listAmountCents: 1299,
    promotionDiscountCents: 0,
    couponDiscountCents: 0,
    amountCents: 1299,
    currency: "CNY",
    pointsAmount: 100,
    dailyPoints: 20,
    periodDays: 30,
    quantity: 1,
    provider: "stripe",
    providerOrderId: "provider-order-live",
    providerPaymentId: "pi_live",
    expiresAt: "2099-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
} satisfies BillingOrderRecord;

const payment = {
    id: "payment-live",
    orderId: order.id,
    userId: order.userId,
    provider: "stripe",
    channel: "fixture",
    status: "succeeded",
    amountCents: order.amountCents,
    currency: order.currency,
    providerTradeId: "pi_live",
    providerPaymentId: "pi_live",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
} satisfies PaymentTransactionRecord;

let fixture: ReturnType<typeof createPaymentFixtureServer>;
let origin: string;

beforeEach(async () => {
    vi.stubEnv("VOZEB_PRO_ALLOW_PRIVATE_UPSTREAMS", "1");
    vi.stubEnv("VOZEB_PRO_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1");
    fixture = createPaymentFixtureServer({ alipayPrivateKey, wechatPrivateKey: wechatPlatformPrivateKey });
    await new Promise<void>((resolve) => fixture.server.listen(0, "127.0.0.1", resolve));
    const address = fixture.server.address();
    if (!address || typeof address === "string") throw new Error("Payment fixture did not bind a TCP port");
    origin = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
    await new Promise<void>((resolve, reject) => fixture.server.close((error) => (error ? reject(error) : resolve())));
    vi.unstubAllEnvs();
});

describe("payment providers over a live compatible HTTP fixture", () => {
    it("creates Stripe, Alipay, WeChat and PayPly checkouts", async () => {
        const stripe = await createProviderCheckout("stripe", order, { origin: "https://app.test" }, config({ VOZEB_PRO_STRIPE_SECRET_KEY: "stripe-secret", VOZEB_PRO_STRIPE_API_BASE: `${origin}/stripe` }));
        const alipay = await createProviderCheckout("alipay", { ...order, provider: "alipay" }, { origin: "https://app.test" }, alipayConfig());
        const wechat = await createProviderCheckout("wechat", { ...order, provider: "wechat" }, { origin: "https://app.test" }, wechatConfig());
        const payply = await createProviderCheckout("payply", { ...order, provider: "payply" }, { origin: "https://app.test" }, config({ VOZEB_PRO_PAYPLY_API_KEY: "payply-secret", VOZEB_PRO_PAYPLY_CHECKOUT_URL: `${origin}/payply/checkout` }));

        expect(stripe).toMatchObject({ kind: "redirect", providerOrderId: "cs_fixture", url: "https://checkout.fixture/stripe" });
        expect(alipay).toMatchObject({ kind: "qr", providerOrderId: order.orderNo, providerPaymentId: "alipay_trade_fixture", qrContent: "https://checkout.fixture/alipay-qr" });
        expect(wechat).toMatchObject({ kind: "qr", qrContent: "weixin://wxpay/bizpayurl?pr=fixture" });
        expect(payply).toMatchObject({ kind: "redirect", providerOrderId: "payply_trade_fixture", providerPaymentId: "payply_payment_fixture", url: "https://checkout.fixture/payply" });
        expect(fixture.requests.map((request) => request.path)).toEqual(["/stripe/v1/checkout/sessions", "/alipay/gateway.do", "/wechat/v3/pay/transactions/native", "/payply/checkout"]);
        expect(fixture.requests[0]?.headers["idempotency-key"]).toBe("vozeb-pro-checkout-order-live");
        expect(fixture.requests[2]?.headers.authorization).toContain('mchid="1900000001"');
        expect(fixture.requests[3]?.headers.authorization).toBe("Bearer payply-secret");
    });

    it("creates Stripe, Alipay, WeChat and PayPly refunds", async () => {
        setRuntimeConfig({ VOZEB_PRO_STRIPE_SECRET_KEY: "stripe-secret", VOZEB_PRO_STRIPE_API_BASE: `${origin}/stripe` });
        const stripe = await refundPaymentTransaction(order, payment);

        setRuntimeConfig(alipayConfig().valuesByEnvName);
        const alipay = await refundPaymentTransaction({ ...order, provider: "alipay" }, { ...payment, provider: "alipay", providerTradeId: "alipay_trade_fixture", providerPaymentId: "alipay_trade_fixture" });

        setRuntimeConfig(wechatConfig().valuesByEnvName);
        const wechat = await refundPaymentTransaction({ ...order, provider: "wechat" }, { ...payment, provider: "wechat", providerTradeId: "wechat_trade_fixture", providerPaymentId: "wechat_trade_fixture" });

        setRuntimeConfig({ VOZEB_PRO_PAYPLY_API_KEY: "payply-secret", VOZEB_PRO_PAYPLY_REFUND_URL: `${origin}/payply/refund` });
        const payply = await refundPaymentTransaction({ ...order, provider: "payply" }, { ...payment, provider: "payply", providerTradeId: "payply_trade_fixture", providerPaymentId: "payply_payment_fixture" });

        expect(stripe).toMatchObject({ status: "succeeded", providerRefundId: "re_fixture" });
        expect(alipay).toMatchObject({ status: "succeeded", providerRefundId: "vozeb-pro-refund-order-live" });
        expect(wechat).toMatchObject({ status: "succeeded", providerRefundId: "wx_refund_fixture" });
        expect(payply).toMatchObject({ status: "succeeded", providerRefundId: "payply_refund_fixture" });
        expect(fixture.requests.map((request) => request.path)).toEqual(["/stripe/v1/refunds", "/alipay/gateway.do", "/wechat/v3/refund/domestic/refunds", "/payply/refund"]);
        expect(fixture.requests[0]?.headers["idempotency-key"]).toBe("vozeb-pro-refund-order-live");
        expect(fixture.requests[2]?.headers.authorization).toContain('mchid="1900000001"');
        expect(fixture.requests[3]?.headers["idempotency-key"]).toBe("vozeb-pro-refund-order-live");
    });
});

function config(valuesByEnvName: Record<string, string>): PaymentRuntimeConfig {
    return { saved: { providers: {} }, providers: {}, valuesByEnvName };
}

function alipayConfig(): PaymentRuntimeConfig {
    return config({
        VOZEB_PRO_ALIPAY_MODE: "face_to_face",
        VOZEB_PRO_ALIPAY_APP_ID: "2026000000000000",
        VOZEB_PRO_ALIPAY_PRIVATE_KEY: alipayPrivateKey,
        VOZEB_PRO_ALIPAY_PUBLIC_KEY: alipayPublicKey,
        VOZEB_PRO_ALIPAY_GATEWAY_URL: `${origin}/alipay/gateway.do`,
    });
}

function wechatConfig(): PaymentRuntimeConfig {
    return config({
        VOZEB_PRO_WECHAT_PAY_APP_ID: "wx-fixture-app",
        VOZEB_PRO_WECHAT_PAY_MCH_ID: "1900000001",
        VOZEB_PRO_WECHAT_PAY_CERT_SERIAL_NO: "fixture-serial",
        VOZEB_PRO_WECHAT_PAY_PRIVATE_KEY: wechatPrivateKey,
        VOZEB_PRO_WECHAT_PAY_PLATFORM_PUBLIC_KEY: wechatPlatformPublicKey,
        VOZEB_PRO_WECHAT_PAY_API_BASE: `${origin}/wechat`,
    });
}

function setRuntimeConfig(valuesByEnvName: Record<string, string>) {
    mocks.runtimeConfig = { saved: { providers: {} }, providers: {}, valuesByEnvName };
}
