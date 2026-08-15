import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getInstallStatus: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/install-status", () => ({ getInstallStatus: mocks.getInstallStatus }));

import { getAuthenticatedPageAccess } from "./page-access";

describe("authenticated page access", () => {
    beforeEach(() => {
        mocks.getCurrentUser.mockReset();
        mocks.getInstallStatus.mockReset().mockResolvedValue({ ready: true, firstAdminRequired: false, database: { healthy: true } });
    });

    it("skips install status for an authenticated user", async () => {
        const user = { id: "user-one", role: "user" };
        mocks.getCurrentUser.mockResolvedValue(user);

        await expect(getAuthenticatedPageAccess()).resolves.toEqual({ user, install: null });
        expect(mocks.getInstallStatus).not.toHaveBeenCalled();
    });

    it("loads install status when no session user exists", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);

        await expect(getAuthenticatedPageAccess()).resolves.toMatchObject({ user: null, install: { ready: true } });
        expect(mocks.getInstallStatus).toHaveBeenCalledTimes(1);
    });

    it("falls back to install status when authentication storage fails", async () => {
        mocks.getCurrentUser.mockRejectedValue(new Error("database unavailable"));

        await expect(getAuthenticatedPageAccess()).resolves.toMatchObject({ user: null, install: { ready: true } });
        expect(mocks.getInstallStatus).toHaveBeenCalledTimes(1);
    });
});
