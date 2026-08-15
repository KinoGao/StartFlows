import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    listUserCoupons: vi.fn(),
    listUserCouponsForProduct: vi.fn(),
    listClaimableCouponTemplates: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/billing-service", () => ({ isBillingInputError: vi.fn(() => false) }));
vi.mock("@/lib/server/coupon-service", () => ({
    listUserCoupons: mocks.listUserCoupons,
    listUserCouponsForProduct: mocks.listUserCouponsForProduct,
    listClaimableCouponTemplates: mocks.listClaimableCouponTemplates,
}));

import { GET } from "./route";

describe("GET /api/billing/coupons", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one", role: "user" });
        mocks.listUserCoupons.mockResolvedValue({ items: [{ id: "coupon-one" }], total: 1, page: 1, pageSize: 20 });
        mocks.listUserCouponsForProduct.mockResolvedValue({ items: [{ id: "coupon-one", applicable: true }], total: 1, page: 2, pageSize: 10 });
        mocks.listClaimableCouponTemplates.mockResolvedValue({ items: [{ id: "template-one" }], total: 9, page: 2, pageSize: 8 });
    });

    it("requires a signed-in user", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        const response = await GET(new NextRequest("http://localhost/api/billing/coupons"));
        expect(response.status).toBe(401);
        expect(mocks.listUserCoupons).not.toHaveBeenCalled();
    });

    it("returns product applicability without querying unrelated claimable templates", async () => {
        const response = await GET(new NextRequest("http://localhost/api/billing/coupons?productId=product-one&quantity=2&page=2&pageSize=10&status=available&includeTemplates=false"));
        expect(response.status).toBe(200);
        expect(mocks.listUserCouponsForProduct).toHaveBeenCalledWith("user-one", { productId: "product-one", quantity: "2", page: 2, pageSize: 10, status: "available" });
        expect(mocks.listClaimableCouponTemplates).not.toHaveBeenCalled();
        expect(await response.json()).toEqual({ code: 0, data: { coupons: [{ id: "coupon-one", applicable: true }], total: 1, page: 2, pageSize: 10 }, msg: "" });
    });

    it("includes claimable templates for the coupon wallet by default", async () => {
        const response = await GET(new NextRequest("http://localhost/api/billing/coupons?page=1&pageSize=8&templatePage=2&templatePageSize=8"));
        expect(response.status).toBe(200);
        expect(mocks.listUserCoupons).toHaveBeenCalledWith("user-one", { page: 1, pageSize: 8, status: undefined });
        expect(mocks.listClaimableCouponTemplates).toHaveBeenCalledWith({ userId: "user-one", page: 2, pageSize: 8 });
        expect(await response.json()).toEqual({ code: 0, data: { coupons: [{ id: "coupon-one" }], templates: [{ id: "template-one" }], templatesTotal: 9, templatePage: 2, templatePageSize: 8, total: 1, page: 1, pageSize: 20 }, msg: "" });
    });
});
