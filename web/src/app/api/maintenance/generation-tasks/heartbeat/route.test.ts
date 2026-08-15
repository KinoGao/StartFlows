import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    configured: vi.fn(),
    authorized: vi.fn(),
    record: vi.fn(),
    install: vi.fn(),
}));

vi.mock("@/lib/server/maintenance-auth", () => ({
    isWorkerTokenConfigured: mocks.configured,
    isAuthorizedWorkerRequest: mocks.authorized,
}));
vi.mock("@/lib/server/generation-worker-heartbeat", () => ({ recordGenerationWorkerHeartbeat: mocks.record }));
vi.mock("@/lib/server/install-status", () => ({ getInstallStatus: mocks.install }));

import { POST } from "./route";

describe("POST /api/maintenance/generation-tasks/heartbeat", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.configured.mockReturnValue(true);
        mocks.authorized.mockReturnValue(true);
        mocks.record.mockResolvedValue(true);
        mocks.install.mockResolvedValue({ database: { schemaReady: true } });
    });

    it("records an authenticated Worker heartbeat", async () => {
        const response = await POST(request("worker-one"));

        expect(response.status).toBe(200);
        expect(mocks.record).toHaveBeenCalledWith("worker-one");
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { accepted: true } });
    });

    it("rejects missing Worker identity", async () => {
        const response = await POST(request());
        expect(response.status).toBe(400);
        expect(mocks.record).not.toHaveBeenCalled();
    });

    it("waits quietly before the database is initialized", async () => {
        mocks.install.mockResolvedValue({ database: { schemaReady: false } });

        const response = await POST(request("worker-one"));

        expect(response.status).toBe(200);
        expect(mocks.record).not.toHaveBeenCalled();
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { accepted: false } });
    });
});

function request(workerId = "") {
    return new Request("http://localhost/api/maintenance/generation-tasks/heartbeat", {
        method: "POST",
        headers: {
            authorization: "Bearer test-token",
            ...(workerId ? { "x-vozeb-pro-worker-id": workerId } : {}),
        },
    });
}
