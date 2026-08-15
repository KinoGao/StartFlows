import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getById: vi.fn(),
    update: vi.fn(),
    getPublicDetails: vi.fn(),
    ensureSchema: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
    createPostgresRepositories: vi.fn(() => ({ users: { getById: mocks.getById, update: mocks.update, getPublicDetails: mocks.getPublicDetails } })),
    ensurePostgresSchema: mocks.ensureSchema,
    isPostgresDatabaseEnabled: vi.fn(() => true),
    withPostgresTransaction: vi.fn(async (handler: (client: unknown) => Promise<unknown>) => handler({})),
}));

import { updateOwnProfile } from "./store-actions";

const user = {
    id: "user-one",
    accountId: "0001",
    username: "tester",
    displayName: "旧昵称",
    bio: "旧简介",
    role: "user" as const,
    adminPermissions: [],
    status: "active" as const,
    planId: "free",
    pointsBalance: 0,
    passwordHash: "hash",
    createdAt: "2026-07-27T00:00:00.000Z",
    updatedAt: "2026-07-27T00:00:00.000Z",
};

describe("updateOwnProfile", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getById.mockResolvedValue(user);
        mocks.update.mockResolvedValue({ ...user, displayName: "新昵称", bio: "新简介" });
        mocks.getPublicDetails.mockResolvedValue([{ user: { ...user, displayName: "新昵称", bio: "新简介" }, planId: "free", planName: "免费版", permanentPoints: 0, dailyPoints: 0 }]);
    });

    it("updates nickname and bio through the directed PostgreSQL repository path", async () => {
        const result = await updateOwnProfile("user-one", { displayName: " 新昵称 ", bio: " 新简介 " });

        expect(mocks.ensureSchema).toHaveBeenCalledTimes(1);
        expect(mocks.getById).toHaveBeenCalledWith("user-one", true);
        expect(mocks.update).toHaveBeenCalledWith("user-one", { displayName: "新昵称", bio: "新简介" });
        expect(mocks.getPublicDetails).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({ displayName: "新昵称", bio: "新简介" });
    });
});
