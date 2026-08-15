import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    assertReady: vi.fn(),
    claimDueRefundJobs: vi.fn(),
    findOrderPayment: vi.fn(),
    getOrderById: vi.fn(),
    refundPayment: vi.fn(),
    releaseRefundJob: vi.fn(),
    updateOrder: vi.fn(),
}));

vi.mock("@/lib/server/billing-service-helpers", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/server/billing-service-helpers")>()),
    assertBillingDatabaseReady: mocks.assertReady,
}));
vi.mock("@/lib/server/database", () => ({
    createPostgresRepositories: vi.fn(() => ({
        billing: {
            claimDueRefundJobs: mocks.claimDueRefundJobs,
            findOrderPayment: mocks.findOrderPayment,
            getOrderById: mocks.getOrderById,
            releaseRefundJob: mocks.releaseRefundJob,
            updateOrder: mocks.updateOrder,
        },
    })),
    withPostgresTransaction: vi.fn(),
}));
vi.mock("@/lib/server/payment-refund-service", () => ({
    reconcilePaymentRefund: vi.fn(),
    refundPaymentTransaction: mocks.refundPayment,
}));
vi.mock("@/lib/server/billing-refund-finalization-service", () => ({ finalizeBillingOrderRefund: vi.fn() }));

import { runBillingRefundReconciliationBatch } from "./billing-refund-orchestration-service";

describe("billing refund reconciliation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.assertReady.mockResolvedValue(undefined);
        mocks.getOrderById.mockResolvedValue({ id: "order-one", userId: "user-one", provider: "stripe", status: "refunding", metadata: {} });
        mocks.findOrderPayment.mockResolvedValue({ id: "payment-one", orderId: "order-one", provider: "stripe", status: "succeeded" });
        mocks.updateOrder.mockResolvedValue({ id: "order-one", status: "refunding" });
        mocks.releaseRefundJob.mockImplementation(async (_id, _workerId, patch) => patch);
    });

    it("keeps retryable jobs pending regardless of their audit attempt count and leaves cadence to the scheduler", async () => {
        mocks.claimDueRefundJobs.mockResolvedValue([
            {
                id: "refund-one",
                orderId: "order-one",
                paymentId: "payment-one",
                provider: "stripe",
                status: "processing",
                attempts: 99,
                nextAttemptAt: "2026-08-11T00:00:00.000Z",
                createdAt: "2026-08-11T00:00:00.000Z",
                updatedAt: "2026-08-11T00:00:00.000Z",
            },
        ]);
        mocks.refundPayment.mockRejectedValue(new Error("支付商暂时不可用"));

        await expect(runBillingRefundReconciliationBatch({ workerId: "refund-worker", now: new Date("2026-08-11T01:00:00.000Z") })).resolves.toEqual({ claimed: 1, completed: 0, pending: 1, manual: 0, failed: 0 });

        expect(mocks.releaseRefundJob).toHaveBeenCalledWith("refund-one", "refund-worker", expect.objectContaining({ status: "pending", attempts: 99, nextAttemptAt: expect.any(String), lastError: "支付商暂时不可用" }));
        expect(mocks.releaseRefundJob.mock.calls[0]?.[2]).not.toHaveProperty("maxAttempts");
    });
});
