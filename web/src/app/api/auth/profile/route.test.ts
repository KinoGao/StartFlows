import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), updateProfile: vi.fn(), rateLimit: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser, serializeCurrentUser: (user: unknown) => user }));
vi.mock("@/lib/auth/store", () => ({ updateOwnProfile: mocks.updateProfile, isAuthInputError: vi.fn(() => false) }));
vi.mock("@/lib/server/security", () => ({ checkRateLimit: mocks.rateLimit }));

import { PATCH } from "./route";

describe("PATCH /api/auth/profile", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.currentUser.mockResolvedValue({ id: "user-one" });
        mocks.rateLimit.mockResolvedValue({ allowed: true, resetAt: Date.now() + 60_000 });
        mocks.updateProfile.mockResolvedValue({ id: "user-one", displayName: "新昵称", bio: "新简介" });
    });

    it("updates nickname and bio without requiring email verification", async () => {
        const response = await PATCH(
            new Request("http://localhost/api/auth/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ displayName: "新昵称", bio: "新简介" }),
            }),
        );

        expect(response.status).toBe(200);
        expect(mocks.updateProfile).toHaveBeenCalledWith("user-one", { displayName: "新昵称", bio: "新简介", email: undefined, emailCode: undefined });
        await expect(response.json()).resolves.toMatchObject({ user: { displayName: "新昵称", bio: "新简介" } });
    });
});
