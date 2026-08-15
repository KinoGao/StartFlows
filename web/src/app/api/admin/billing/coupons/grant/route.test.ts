import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), readJsonBody: vi.fn(), issueCoupon: vi.fn(), safeRecordAuditLog: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/request", () => ({ readJsonBody: mocks.readJsonBody }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: mocks.safeRecordAuditLog }));
vi.mock("@/lib/server/billing-service", () => ({ isBillingInputError: vi.fn((error) => Boolean(error && typeof error === "object" && "status" in error)) }));
vi.mock("@/lib/server/coupon-service", () => ({ issueCoupon: mocks.issueCoupon }));

import { POST } from "./route";

describe("POST /api/admin/billing/coupons/grant", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["commerce.manage"] });
        mocks.readJsonBody.mockResolvedValue({ userId: "user-one", templateId: "template-one" });
        mocks.issueCoupon.mockResolvedValue({ id: "coupon-one", userId: "user-one", templateId: "template-one" });
    });

    it("grants and audits a coupon", async () => {
        const response = await POST(new Request("http://localhost/api/admin/billing/coupons/grant", { method: "POST" }));
        expect(response.status).toBe(201);
        expect(mocks.issueCoupon).toHaveBeenCalledWith({ userId: "user-one", templateId: "template-one", source: "admin" });
        expect(mocks.safeRecordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.billing.coupon.grant" }));
    });

    it("rejects a normal user", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one", role: "user" });
        const response = await POST(new Request("http://localhost/api/admin/billing/coupons/grant", { method: "POST" }));
        expect(response.status).toBe(403);
        expect(mocks.issueCoupon).not.toHaveBeenCalled();
    });
});
