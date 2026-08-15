import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getCheckout: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/payment-checkout-service", () => ({ getStoredPaymentCheckoutForOrder: mocks.getCheckout }));

import { GET } from "./route";

describe("payment form route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.getCheckout.mockResolvedValue({
            provider: "alipay",
            orderId: "order-one",
            orderNo: "VZ001",
            kind: "form",
            form: { action: "https://pay.example/submit", method: "POST", fields: [{ name: "token", value: "safe" }] },
        });
    });

    it("returns an isolated auto-submit document for the owned stored checkout", async () => {
        const response = await GET(new Request("http://localhost/api/billing/orders/order-one/payment-form") as never, { params: Promise.resolve({ id: "order-one" }) });

        expect(mocks.getCheckout).toHaveBeenCalledWith("order-one", "user-one");
        expect(response.headers.get("content-type")).toContain("text/html");
        expect(response.headers.get("content-security-policy")).toContain("form-action https://pay.example");
        expect(await response.text()).toContain('action="https://pay.example/submit"');
    });

    it("does not disclose stored payment data before authentication", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);

        const response = await GET(new Request("http://localhost/api/billing/orders/order-one/payment-form") as never, { params: Promise.resolve({ id: "order-one" }) });

        expect(response.status).toBe(401);
        expect(mocks.getCheckout).not.toHaveBeenCalled();
    });
});
