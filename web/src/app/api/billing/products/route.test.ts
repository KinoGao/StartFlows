import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listBillingProducts: vi.fn(), getPaymentConfigSummary: vi.fn() }));

vi.mock("@/lib/server/billing-service", () => ({ isBillingInputError: vi.fn(() => false), listBillingProducts: mocks.listBillingProducts }));
vi.mock("@/lib/server/payment-config-status", () => ({ getPaymentConfigSummary: mocks.getPaymentConfigSummary }));

import { GET } from "./route";

describe("GET /api/billing/products", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.listBillingProducts.mockResolvedValue([{ id: "product" }]);
        mocks.getPaymentConfigSummary.mockResolvedValue({
            providers: [
                { id: "stripe", enabled: true, checkoutReady: false },
                { id: "alipay", enabled: true, checkoutReady: true },
                { id: "wechat", enabled: false, checkoutReady: true },
                { id: "manual", enabled: true, checkoutReady: true },
            ],
        });
    });

    it("only exposes payment providers that can create checkout", async () => {
        const response = await GET();

        expect(await response.json()).toEqual({ products: [{ id: "product" }], paymentProviders: ["alipay", "manual"] });
    });
});
