import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ configured: vi.fn() }));

vi.mock("@/lib/server/database", () => ({ getDatabaseProvider: vi.fn(() => "file") }));
vi.mock("@/lib/server/maintenance-auth", () => ({ isWorkerTokenConfigured: mocks.configured }));

import { getGenerationWorkerHealth, recordGenerationWorkerHeartbeat } from "./generation-worker-heartbeat";

describe("generation Worker heartbeat", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (globalThis as typeof globalThis & { __vozebProGenerationWorkerHeartbeats?: Map<string, number> }).__vozebProGenerationWorkerHeartbeats?.clear();
        mocks.configured.mockReturnValue(true);
    });

    it("becomes healthy after an authenticated Worker heartbeat", async () => {
        await recordGenerationWorkerHeartbeat("worker-test", 1_000_000);
        await expect(getGenerationWorkerHealth(1_030_000)).resolves.toMatchObject({ required: true, healthy: true, lastHeartbeatAt: new Date(1_000_000).toISOString() });
        await expect(getGenerationWorkerHealth(1_100_001)).resolves.toMatchObject({ healthy: false, reason: "heartbeat_stale" });
    });

    it("reports a missing worker token before checking heartbeats", async () => {
        mocks.configured.mockReturnValue(false);
        await expect(getGenerationWorkerHealth()).resolves.toMatchObject({ healthy: false, reason: "worker_token_missing" });
    });

    it("prunes file Provider heartbeats outside the maximum health window", async () => {
        await recordGenerationWorkerHeartbeat("worker-old", 1_000_000);
        await recordGenerationWorkerHeartbeat("worker-current", 1_600_001);

        const heartbeats = (globalThis as typeof globalThis & { __vozebProGenerationWorkerHeartbeats?: Map<string, number> }).__vozebProGenerationWorkerHeartbeats;
        expect([...(heartbeats?.keys() || [])]).toEqual(["worker-current"]);
    });
});
