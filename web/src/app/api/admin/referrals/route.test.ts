import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getAdminReferralOverview: vi.fn(),
    listCouponTemplates: vi.fn(),
    safeRecordAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/referral-service", () => ({ getAdminReferralOverview: mocks.getAdminReferralOverview, saveReferralProgram: vi.fn() }));
vi.mock("@/lib/server/coupon-service", () => ({ listCouponTemplates: mocks.listCouponTemplates }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: mocks.safeRecordAuditLog }));

import { GET } from "./route";

describe("/api/admin/referrals", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["commerce.manage"] });
        mocks.getAdminReferralOverview.mockResolvedValue({
            program: { enabled: false, inviterPoints: 100, inviteeRewardType: "points", inviteePoints: 50, minimumPaidCents: 0, coolingOffDays: 0 },
            stats: { clicks: 0, registrations: 0, qualified: 0, pending: 0, settled: 0, risky: 0 },
        });
    });

    it("loads only the overview on the first screen", async () => {
        const response = await GET();
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.data).not.toHaveProperty("couponTemplates");
        expect(mocks.getAdminReferralOverview).toHaveBeenCalledTimes(1);
        expect(mocks.listCouponTemplates).not.toHaveBeenCalled();
    });
});
