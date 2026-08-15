import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    completeBillingOrderPayment: vi.fn(),
    audit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({ isAuthInputError: vi.fn((error) => Boolean(error && typeof error === "object" && "authStatus" in error)) }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-one" })), safeRecordAuditLog: mocks.audit }));
vi.mock("@/lib/server/billing-service", () => ({ completeBillingOrderPayment: mocks.completeBillingOrderPayment, isBillingInputError: vi.fn(() => false) }));

import { POST } from "./route";

describe("POST /api/admin/billing/orders/:id/complete", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["billing.manage"] });
        mocks.completeBillingOrderPayment.mockResolvedValue({
            order: { id: "order-one", orderNo: "VP-1", userId: "user-one", planId: "creator", amountCents: 1000, currency: "CNY" },
            pointsGranted: 20,
        });
    });

    it("passes only supported payment fields to the billing service", async () => {
        const response = await POST(
            request({
                provider: "manual",
                channel: "admin-manual",
                rawPayload: { unexpected: "nested-value" },
            }),
            context(),
        );

        expect(response.status).toBe(200);
        expect(mocks.completeBillingOrderPayment).toHaveBeenCalledWith(
            expect.objectContaining({
                orderId: "order-one",
                rawPayload: expect.not.objectContaining({ unexpected: expect.anything() }),
            }),
        );
    });

    it("requires the billing management permission", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["billing.read"] });
        const response = await POST(request({ provider: "manual" }), context());

        expect(response.status).toBe(403);
        expect(mocks.completeBillingOrderPayment).not.toHaveBeenCalled();
    });
});

function request(body: unknown) {
    return new Request("http://localhost/api/admin/billing/orders/order-one/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

function context() {
    return { params: Promise.resolve({ id: "order-one" }) };
}
