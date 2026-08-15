import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), readJsonBody: vi.fn(), quoteBillingOrder: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/request", () => ({ readJsonBody: mocks.readJsonBody }));
vi.mock("@/lib/server/billing-service", () => ({ isBillingInputError: vi.fn((error) => Boolean(error && typeof error === "object" && "status" in error)) }));
vi.mock("@/lib/server/billing-commerce-service", () => ({ quoteBillingOrder: mocks.quoteBillingOrder }));

import { POST } from "./route";

describe("POST /api/billing/quotes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one", role: "user" });
        mocks.readJsonBody.mockResolvedValue({ productId: "product-one", quantity: 2, userCouponId: "coupon-one" });
        mocks.quoteBillingOrder.mockResolvedValue({ productId: "product-one", payableAmountCents: 1600 });
    });

    it("quotes against the authenticated user's coupon", async () => {
        const response = await POST(new Request("http://localhost/api/billing/quotes", { method: "POST" }));
        expect(response.status).toBe(200);
        expect(mocks.quoteBillingOrder).toHaveBeenCalledWith({ productId: "product-one", quantity: 2, userCouponId: "coupon-one", userId: "user-one" });
        expect(await response.json()).toMatchObject({ code: 0, data: { quote: { payableAmountCents: 1600 } } });
    });
});
