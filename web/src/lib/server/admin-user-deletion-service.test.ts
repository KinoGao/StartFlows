import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    deleteUserByAdmin: vi.fn(),
    getAuthSettings: vi.fn(),
    getDatabaseProvider: vi.fn(),
    deleteGenerationLogsByUserId: vi.fn(),
    deleteRegisteredLocalMediaSnapshots: vi.fn(),
    listLocalMediaRegistrationsForDeletion: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({ deleteUserByAdmin: mocks.deleteUserByAdmin, getAuthSettings: mocks.getAuthSettings }));
vi.mock("@/lib/server/database", () => ({ getDatabaseProvider: mocks.getDatabaseProvider }));
vi.mock("@/lib/server/generation-log-store", () => ({ deleteGenerationLogsByUserId: mocks.deleteGenerationLogsByUserId }));
vi.mock("@/lib/server/local-media-storage", () => ({ deleteRegisteredLocalMediaSnapshots: mocks.deleteRegisteredLocalMediaSnapshots }));
vi.mock("@/lib/server/local-media-registry", () => ({ listLocalMediaRegistrationsForDeletion: mocks.listLocalMediaRegistrationsForDeletion }));

import { deleteAdminUserWithMediaCleanup } from "./admin-user-deletion-service";

describe("administrator user deletion orchestration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getAuthSettings.mockResolvedValue({ dataLifecycle: { maintenanceBatchSize: 24 } });
        mocks.listLocalMediaRegistrationsForDeletion.mockResolvedValue([{ storageKey: "permanent/user.webp", ownerUserId: "user-one" }]);
        mocks.deleteRegisteredLocalMediaSnapshots.mockResolvedValue({ deletedFiles: 1, deletedBytes: 4, blocked: [] });
        mocks.deleteGenerationLogsByUserId.mockResolvedValue({ deleted: 1 });
    });

    it("snapshots media inside the locked PostgreSQL deletion transaction before cascade", async () => {
        mocks.getDatabaseProvider.mockReturnValue("postgres");
        mocks.deleteUserByAdmin.mockImplementation(async (_actor: string, _user: string, options: { beforeDelete: (client: unknown, userId: string) => Promise<void> }) => {
            await options.beforeDelete({ query: vi.fn() }, "user-one");
            return { ok: true };
        });

        await expect(deleteAdminUserWithMediaCleanup("admin-one", "user-one")).resolves.toEqual({ ok: true });

        expect(mocks.listLocalMediaRegistrationsForDeletion).toHaveBeenCalledWith("user-one", { batchSize: 24, executor: expect.any(Object), forUpdate: true });
        expect(mocks.deleteRegisteredLocalMediaSnapshots).toHaveBeenCalledWith([{ storageKey: "permanent/user.webp", ownerUserId: "user-one" }]);
        expect(mocks.deleteGenerationLogsByUserId).not.toHaveBeenCalled();
    });

    it("keeps file-provider log cleanup and media cleanup after account deletion", async () => {
        mocks.getDatabaseProvider.mockReturnValue("file");
        mocks.deleteUserByAdmin.mockResolvedValue({ ok: true });

        await expect(deleteAdminUserWithMediaCleanup("admin-one", "user-one")).resolves.toEqual({ ok: true });

        expect(mocks.listLocalMediaRegistrationsForDeletion).toHaveBeenCalledWith("user-one", { batchSize: 24 });
        expect(mocks.deleteGenerationLogsByUserId).toHaveBeenCalledWith("user-one");
        expect(mocks.deleteRegisteredLocalMediaSnapshots).toHaveBeenCalledWith([{ storageKey: "permanent/user.webp", ownerUserId: "user-one" }]);
        expect(mocks.deleteUserByAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteGenerationLogsByUserId.mock.invocationCallOrder[0]);
        expect(mocks.deleteGenerationLogsByUserId.mock.invocationCallOrder[0]).toBeLessThan(mocks.deleteRegisteredLocalMediaSnapshots.mock.invocationCallOrder[0]);
    });
});
