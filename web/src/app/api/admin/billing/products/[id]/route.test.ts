import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    deleteBillingProduct: vi.fn(),
    safeRecordAuditLog: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/request", () => ({ readJsonBody: vi.fn() }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: mocks.safeRecordAuditLog }));
vi.mock("@/lib/server/billing-service", () => ({
    deleteBillingProduct: mocks.deleteBillingProduct,
    isBillingInputError: vi.fn((error) => Boolean(error && typeof error === "object" && "status" in error)),
    updateBillingProduct: vi.fn(),
}));

import { DELETE } from "./route";

describe("DELETE /api/admin/billing/products/[id]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", status: "active", adminPermissions: ["commerce.manage"] });
        mocks.deleteBillingProduct.mockResolvedValue({ id: "product", name: "商品" });
    });

    it("permanently deletes an unused product", async () => {
        const response = await DELETE(new Request("http://localhost/api/admin/billing/products/product", { method: "DELETE" }), { params: Promise.resolve({ id: "product" }) });

        expect(response.status).toBe(200);
        expect(mocks.deleteBillingProduct).toHaveBeenCalledWith("product");
        expect(mocks.safeRecordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.billing.product.delete" }));
    });

    it("returns the protected-order conflict", async () => {
        mocks.deleteBillingProduct.mockRejectedValue(Object.assign(new Error("该商品已有订单记录，不能永久删除，请改为下架"), { status: 409 }));

        const response = await DELETE(new Request("http://localhost/api/admin/billing/products/product", { method: "DELETE" }), { params: Promise.resolve({ id: "product" }) });

        expect(response.status).toBe(409);
        expect(await response.json()).toMatchObject({ error: "该商品已有订单记录，不能永久删除，请改为下架" });
    });
});
