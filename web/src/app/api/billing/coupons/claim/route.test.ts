import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), readJsonBody: vi.fn(), issueCoupon: vi.fn(), safeRecordAuditLog: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/request", () => ({ readJsonBody: mocks.readJsonBody }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: mocks.safeRecordAuditLog }));
vi.mock("@/lib/server/billing-service", () => ({ isBillingInputError: vi.fn((error) => Boolean(error && typeof error === "object" && "status" in error)) }));
vi.mock("@/lib/server/coupon-service", () => ({ issueCoupon: mocks.issueCoupon }));

import { POST } from "./route";

describe("POST /api/billing/coupons/claim", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one", role: "user" });
        mocks.readJsonBody.mockResolvedValue({ code: "WELCOME" });
        mocks.issueCoupon.mockResolvedValue({ id: "coupon-one", templateId: "template-one" });
    });

    it("claims a coupon for the authenticated user and audits it", async () => {
        const response = await POST(new Request("http://localhost/api/billing/coupons/claim", { method: "POST" }));
        expect(response.status).toBe(201);
        expect(mocks.issueCoupon).toHaveBeenCalledWith({ code: "WELCOME", userId: "user-one", source: "claim" });
        expect(mocks.safeRecordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "billing.coupon.claim" }));
    });

    it("preserves a claim conflict status", async () => {
        mocks.issueCoupon.mockRejectedValue(Object.assign(new Error("优惠券已领完"), { status: 409 }));
        const response = await POST(new Request("http://localhost/api/billing/coupons/claim", { method: "POST" }));
        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ code: 409, msg: "优惠券已领完" });
        expect(mocks.safeRecordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ status: "failure" }));
    });
});
