import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    provider: "file" as "file" | "postgres",
    runBatch: vi.fn(),
    installStatus: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({ getDatabaseProvider: () => mocks.provider }));
vi.mock("@/lib/server/billing-refund-orchestration-service", () => ({ runBillingRefundReconciliationBatch: mocks.runBatch }));
vi.mock("@/lib/server/install-status", () => ({ getInstallStatus: mocks.installStatus }));
vi.mock("@/lib/server/maintenance-auth", () => ({ isAuthorizedWorkerRequest: () => true, isWorkerTokenConfigured: () => true }));

import { POST } from "./route";

describe("billing refund maintenance route", () => {
    beforeEach(() => {
        mocks.provider = "file";
        mocks.runBatch.mockReset();
        mocks.installStatus.mockReset();
    });

    it("stays idle without retry errors when the file provider is active", async () => {
        const response = await POST(request());

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ code: 0, data: { claimed: 0 }, msg: "当前存储模式无需处理退款补偿任务" });
        expect(mocks.installStatus).not.toHaveBeenCalled();
        expect(mocks.runBatch).not.toHaveBeenCalled();
    });

    it("runs the reconciliation batch for a ready PostgreSQL database", async () => {
        mocks.provider = "postgres";
        mocks.installStatus.mockResolvedValue({ database: { schemaReady: true } });
        mocks.runBatch.mockResolvedValue({ claimed: 1, completed: 1, pending: 0, failed: 0 });

        const response = await POST(request());

        expect(response.status).toBe(200);
        expect(mocks.runBatch).toHaveBeenCalledWith({ workerId: "e2e-worker", limit: 10 });
    });
});

function request() {
    return new Request("http://localhost/api/maintenance/billing-refunds/run", { method: "POST", headers: { "x-vozeb-pro-worker-id": "e2e-worker" } });
}
