import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getPaymentConfigSummary: vi.fn(),
    savePaymentProviderConfig: vi.fn(),
    audit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-one" })), safeRecordAuditLog: mocks.audit }));
vi.mock("@/lib/server/payment-config-store", () => ({ savePaymentProviderConfig: mocks.savePaymentProviderConfig }));
vi.mock("@/lib/server/payment-config-status", () => ({ getPaymentConfigSummary: mocks.getPaymentConfigSummary }));

import { BillingInputError } from "@/lib/server/billing-errors";
import { PATCH } from "./route";

describe("PATCH /api/admin/billing/payment-config", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["billing.manage"] });
        mocks.getPaymentConfigSummary.mockResolvedValue({ providers: [] });
        mocks.savePaymentProviderConfig.mockResolvedValue(undefined);
    });

    it("passes the selected Alipay mode to the payment config service", async () => {
        const response = await PATCH(
            new Request("http://localhost/api/admin/billing/payment-config", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ providerId: "alipay", enabled: true, values: { mode: "face_to_face" } }),
            }),
        );

        expect(response.status).toBe(200);
        expect(mocks.savePaymentProviderConfig).toHaveBeenCalledWith({ providerId: "alipay", enabled: true, values: { mode: "face_to_face" } });
        expect(mocks.audit).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "admin.billing.payment-config.update",
                target: { type: "payment_provider", id: "alipay" },
                metadata: { enabled: true },
            }),
        );
    });

    it("maps invalid selector values to a client error", async () => {
        mocks.savePaymentProviderConfig.mockRejectedValue(new BillingInputError("接入方式配置无效", 400));

        const response = await PATCH(
            new Request("http://localhost/api/admin/billing/payment-config", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ providerId: "alipay", enabled: true, values: { mode: "both" } }),
            }),
        );

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "接入方式配置无效" });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.billing.payment-config.update", status: "failure" }));
    });

    it("does not expose payment secrets in audit metadata when saving fails", async () => {
        mocks.savePaymentProviderConfig.mockRejectedValue(new BillingInputError("支付配置无效", 400));

        const response = await PATCH(
            new Request("http://localhost/api/admin/billing/payment-config", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ providerId: "stripe", enabled: true, values: { secretKey: "payment-secret" } }),
            }),
        );

        expect(response.status).toBe(400);
        expect(mocks.savePaymentProviderConfig).toHaveBeenCalledOnce();
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("payment-secret");
    });
});
