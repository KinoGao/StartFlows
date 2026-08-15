import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    runDataLifecycleMaintenance: vi.fn(),
    configured: true,
    authorized: true,
}));

vi.mock("@/lib/server/data-lifecycle-service", () => ({ runDataLifecycleMaintenance: mocks.runDataLifecycleMaintenance }));
vi.mock("@/lib/server/maintenance-auth", () => ({
    isMaintenanceTokenConfigured: () => mocks.configured,
    isAuthorizedMaintenanceRequest: () => mocks.authorized,
}));

import { POST } from "./route";

describe("data lifecycle maintenance route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.configured = true;
        mocks.authorized = true;
        mocks.runDataLifecycleMaintenance.mockResolvedValue({ sessions: 1, emailCodes: 2, generationTasks: 3, temporaryMedia: { deletedFiles: 4, deletedBytes: 5, blocked: [] } });
    });

    it("rejects requests when the maintenance token is unavailable", async () => {
        mocks.configured = false;
        const response = await POST(request());
        expect(response.status).toBe(503);
        expect(mocks.runDataLifecycleMaintenance).not.toHaveBeenCalled();
    });

    it("rejects an invalid maintenance token", async () => {
        mocks.authorized = false;
        const response = await POST(request());
        expect(response.status).toBe(401);
        expect(mocks.runDataLifecycleMaintenance).not.toHaveBeenCalled();
    });

    it("returns the completed bounded maintenance summary", async () => {
        const response = await POST(request());
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { sessions: 1, emailCodes: 2, generationTasks: 3, temporaryMedia: { deletedFiles: 4 } } });
    });
});

function request() {
    return new Request("http://localhost/api/maintenance/data-lifecycle/run", { method: "POST" });
}
