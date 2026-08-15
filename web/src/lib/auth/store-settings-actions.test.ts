import { beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_SETTINGS } from "./store-foundation";

const mocks = vi.hoisted(() => ({
    postgresEnabled: true,
    readAuthDb: vi.fn(),
    readPostgresAuthSettings: vi.fn(),
    updatePostgresAuthSettings: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({ isPostgresDatabaseEnabled: vi.fn(() => mocks.postgresEnabled) }));
vi.mock("./postgres-auth-settings-service", () => ({ updatePostgresAuthSettings: mocks.updatePostgresAuthSettings }));
vi.mock("./store-repository", () => ({
    mutateAuthDb: vi.fn(),
    readAuthDb: mocks.readAuthDb,
    readPostgresAuthSettings: mocks.readPostgresAuthSettings,
}));

import { getAuthSettings, getFreshAuthSettings } from "./store-settings-actions";

describe("auth settings cache", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.postgresEnabled = true;
    });

    it("bypasses a warm PostgreSQL cache and replaces it with the latest settings", async () => {
        const cached = structuredClone(DEFAULT_SETTINGS);
        cached.dataLifecycle.maintenanceBatchSize = 100;
        const fresh = structuredClone(DEFAULT_SETTINGS);
        fresh.dataLifecycle.maintenanceBatchSize = 101;
        mocks.readPostgresAuthSettings.mockResolvedValueOnce(cached).mockResolvedValueOnce(fresh);

        await expect(getAuthSettings()).resolves.toEqual(cached);
        await expect(getAuthSettings()).resolves.toEqual(cached);
        expect(mocks.readPostgresAuthSettings).toHaveBeenCalledTimes(1);

        await expect(getFreshAuthSettings()).resolves.toEqual(fresh);
        await expect(getAuthSettings()).resolves.toEqual(fresh);
        expect(mocks.readPostgresAuthSettings).toHaveBeenCalledTimes(2);
    });
});
