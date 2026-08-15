import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), readJsonBody: vi.fn(), listPromotionCampaigns: vi.fn(), savePromotionCampaign: vi.fn(), safeRecordAuditLog: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/request", () => ({ readJsonBody: mocks.readJsonBody }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: mocks.safeRecordAuditLog }));
vi.mock("@/lib/server/billing-service", () => ({ isBillingInputError: vi.fn(() => false) }));
vi.mock("@/lib/server/promotion-service", () => ({ listPromotionCampaigns: mocks.listPromotionCampaigns, savePromotionCampaign: mocks.savePromotionCampaign }));

import { GET, POST } from "./route";

describe("/api/admin/billing/promotions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["commerce.manage"] });
        mocks.listPromotionCampaigns.mockResolvedValue({ items: [{ id: "promotion-one" }], total: 1, page: 2, pageSize: 10 });
        mocks.readJsonBody.mockResolvedValue({ name: "限时活动" });
        mocks.savePromotionCampaign.mockResolvedValue({ id: "promotion-one", name: "限时活动", enabled: true, products: [] });
    });

    it("rejects a non-admin before querying", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one", role: "user" });
        const response = await GET(new NextRequest("http://localhost/api/admin/billing/promotions"));
        expect(response.status).toBe(403);
        expect(mocks.listPromotionCampaigns).not.toHaveBeenCalled();
    });

    it("lists campaigns with pagination", async () => {
        const response = await GET(new NextRequest("http://localhost/api/admin/billing/promotions?page=2&pageSize=10"));
        expect(response.status).toBe(200);
        expect(mocks.listPromotionCampaigns).toHaveBeenCalledWith({ page: 2, pageSize: 10, includeDisabled: true });
    });

    it("creates and audits a campaign", async () => {
        const response = await POST(new Request("http://localhost/api/admin/billing/promotions", { method: "POST" }));
        expect(response.status).toBe(201);
        expect(mocks.savePromotionCampaign).toHaveBeenCalledWith({ name: "限时活动", createdByUserId: "admin-one" });
        expect(mocks.safeRecordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.billing.promotion.save" }));
    });
});
