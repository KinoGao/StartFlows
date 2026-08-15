import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getInstallStatus: vi.fn(), getGenerationWorkerHealth: vi.fn() }));

vi.mock("@/lib/server/install-status", () => ({ getInstallStatus: mocks.getInstallStatus }));
vi.mock("@/lib/server/generation-worker-heartbeat", () => ({ getGenerationWorkerHealth: mocks.getGenerationWorkerHealth }));

import { GET } from "./route";

describe("readiness route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getGenerationWorkerHealth.mockResolvedValue({ required: true, healthy: true, lastHeartbeatAt: "2026-07-29T00:00:00.000Z", staleAfterMs: 90_000 });
    });

    it("returns 200 only when the runtime is fully initialized", async () => {
        mocks.getInstallStatus.mockResolvedValue({
            ready: true,
            provider: "postgres",
            firstAdminRequired: false,
            database: { healthy: true, schemaReady: true },
            security: { encryptionReady: true },
        });

        const response = await GET();

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { ready: true, database: { healthy: true, schemaReady: true } } });
    });

    it("returns 503 while installation or a dependency is unavailable", async () => {
        mocks.getInstallStatus.mockResolvedValue({
            ready: false,
            provider: "postgres",
            firstAdminRequired: true,
            database: { healthy: true, schemaReady: true },
            security: { encryptionReady: true },
        });

        const response = await GET();

        expect(response.status).toBe(503);
        expect(response.headers.get("cache-control")).toBe("no-store");
        await expect(response.json()).resolves.toMatchObject({ code: 503, data: { ready: false, firstAdminRequired: true } });
    });

    it("does not query Worker storage before the database is initialized", async () => {
        mocks.getInstallStatus.mockResolvedValue({
            ready: false,
            provider: "postgres",
            firstAdminRequired: false,
            database: { healthy: true, schemaReady: false },
            security: { encryptionReady: true },
        });

        const response = await GET();

        expect(response.status).toBe(503);
        expect(mocks.getGenerationWorkerHealth).not.toHaveBeenCalled();
        await expect(response.json()).resolves.toMatchObject({ code: 503, data: { generationWorker: { healthy: false, reason: "installation_pending" } } });
    });

    it("returns 503 when the generation Worker heartbeat is missing", async () => {
        mocks.getInstallStatus.mockResolvedValue({
            ready: true,
            provider: "postgres",
            firstAdminRequired: false,
            database: { healthy: true, schemaReady: true },
            security: { encryptionReady: true },
        });
        mocks.getGenerationWorkerHealth.mockResolvedValue({ required: true, healthy: false, lastHeartbeatAt: null, staleAfterMs: 90_000, reason: "heartbeat_missing" });

        const response = await GET();

        expect(response.status).toBe(503);
        await expect(response.json()).resolves.toMatchObject({ code: 503, data: { ready: false, generationWorker: { healthy: false, reason: "heartbeat_missing" } } });
    });
});
