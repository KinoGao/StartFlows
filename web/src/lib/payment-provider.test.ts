import { describe, expect, it } from "vitest";

import { normalizePaymentProvider } from "./payment-provider";

describe("payment provider normalization", () => {
    it("normalizes shared aliases and case", () => {
        expect(normalizePaymentProvider("Stripe-Checkout")).toBe("stripe");
        expect(normalizePaymentProvider("ALI")).toBe("alipay");
        expect(normalizePaymentProvider("wechatPay")).toBe("wechat");
        expect(normalizePaymentProvider("pay_ply")).toBe("payply");
    });

    it("preserves custom provider ids and caller fallbacks", () => {
        expect(normalizePaymentProvider("vendor.custom")).toBe("vendor.custom");
        expect(normalizePaymentProvider(undefined, "custom")).toBe("custom");
    });
});
