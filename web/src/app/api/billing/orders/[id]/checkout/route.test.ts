import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), createCheckout: vi.fn(), recordAudit: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ userId: "user-one" })), safeRecordAuditLog: mocks.recordAudit }));
vi.mock("@/lib/server/payment-checkout-service", () => ({ createPaymentCheckoutForOrder: mocks.createCheckout }));

import { POST } from "./route";

describe("payment checkout route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.createCheckout.mockResolvedValue({ provider: "alipay", orderId: "order-one", orderNo: "VZ001", kind: "form" });
    });

    it("uses the common business response envelope", async () => {
        const request = new NextRequest("http://localhost/api/billing/orders/order-one/checkout", { method: "POST", body: JSON.stringify({ provider: "alipay" }) });
        const response = await POST(request, { params: Promise.resolve({ id: "order-one" }) });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ code: 0, data: { checkout: { provider: "alipay", orderId: "order-one", orderNo: "VZ001", kind: "form" } }, msg: "支付参数已创建" });
    });
});
