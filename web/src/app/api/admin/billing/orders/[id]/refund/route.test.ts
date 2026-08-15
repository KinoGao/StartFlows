import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    refundBillingOrder: vi.fn(),
    audit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({ isAuthInputError: vi.fn((error) => Boolean(error && typeof error === "object" && "authStatus" in error)) }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-one" })), safeRecordAuditLog: mocks.audit }));
vi.mock("@/lib/server/billing-service", () => ({ refundBillingOrder: mocks.refundBillingOrder, isBillingInputError: vi.fn(() => false) }));

import { POST } from "./route";

describe("POST /api/admin/billing/orders/:id/refund", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["billing.manage"] });
        mocks.refundBillingOrder.mockResolvedValue({ order: { id: "order-one", orderNo: "VP-1", userId: "user-one", status: "refunded", amountCents: 1000, currency: "CNY" } });
    });

    it("passes only refund fields to the billing service", async () => {
        const response = await POST(request({ reason: "用户申请", rawPayload: { unexpected: "nested-value" } }), context());

        expect(response.status).toBe(200);
        expect(mocks.refundBillingOrder).toHaveBeenCalledWith("order-one", { reason: "用户申请", operatorUserId: "admin-one" });
        expect(JSON.stringify(mocks.refundBillingOrder.mock.calls)).not.toContain("nested-value");
    });
});

function request(body: unknown) {
    return new Request("http://localhost/api/admin/billing/orders/order-one/refund", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

function context() {
    return { params: Promise.resolve({ id: "order-one" }) };
}
