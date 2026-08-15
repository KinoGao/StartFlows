import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getAdminBillingSummary: vi.fn(),
    isBillingInputError: vi.fn(() => false),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/billing-service", () => ({ getAdminBillingSummary: mocks.getAdminBillingSummary, isBillingInputError: mocks.isBillingInputError }));

import { GET } from "./route";

describe("admin billing summary route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getAdminBillingSummary.mockResolvedValue({
            orders: { total: 12 },
            payments: {},
            commerce: { convertedOrders: 8, promotionOrders: 6, promotionConvertedOrders: 5, promotionDiscountCents: 1600, couponOrders: 4, couponConvertedOrders: 3, couponDiscountCents: 900 },
            providers: [],
            reconciliation: {},
        });
    });

    it("requires an administrator", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one", role: "user" });

        const response = await GET(new NextRequest("http://localhost/api/admin/billing/summary"));

        expect(response.status).toBe(403);
        expect(mocks.getAdminBillingSummary).not.toHaveBeenCalled();
    });

    it("passes an optional date window to the summary service", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["billing.read"] });

        const response = await GET(new NextRequest("http://localhost/api/admin/billing/summary?startDate=2026-07-01&endDate=2026-07-31"));
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(mocks.getAdminBillingSummary).toHaveBeenCalledWith({ startDate: "2026-07-01", endDate: "2026-07-31" });
        expect(payload.summary.commerce).toEqual({ convertedOrders: 8, promotionOrders: 6, promotionConvertedOrders: 5, promotionDiscountCents: 1600, couponOrders: 4, couponConvertedOrders: 3, couponDiscountCents: 900 });
    });
});
