import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    postgres: true,
    ensureSchema: vi.fn(),
    getById: vi.fn(),
    readAuthDb: vi.fn(),
    verifyPassword: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
    createPostgresRepositories: vi.fn(() => ({ users: { getById: mocks.getById } })),
    ensurePostgresSchema: mocks.ensureSchema,
    isPostgresDatabaseEnabled: vi.fn(() => mocks.postgres),
}));
vi.mock("./password", () => ({ hashPassword: vi.fn(), verifyPassword: mocks.verifyPassword }));
vi.mock("./store-repository", async (importOriginal) => {
    const original = await importOriginal<typeof import("./store-repository")>();
    return { ...original, readAuthDb: mocks.readAuthDb };
});

import { verifyUserPasswordForSensitiveAction } from "./store-actions";

const user = { id: "user-one", status: "active", passwordHash: "hash" };

describe("sensitive action password verification", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.postgres = true;
        mocks.getById.mockResolvedValue(user);
        mocks.readAuthDb.mockResolvedValue({ users: [user] });
        mocks.verifyPassword.mockResolvedValue(true);
    });

    it("uses a directed PostgreSQL user lookup", async () => {
        await verifyUserPasswordForSensitiveAction("user-one", "secret");

        expect(mocks.ensureSchema).toHaveBeenCalledTimes(1);
        expect(mocks.getById).toHaveBeenCalledWith("user-one");
        expect(mocks.readAuthDb).not.toHaveBeenCalled();
    });

    it("rejects a wrong password for the file provider", async () => {
        mocks.postgres = false;
        mocks.verifyPassword.mockResolvedValue(false);

        await expect(verifyUserPasswordForSensitiveAction("user-one", "wrong")).rejects.toThrow("当前密码不正确");
    });
});
