import * as OTPAuth from "otpauth";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthDatabase } from "@/lib/auth/store-types";

const mocks = vi.hoisted(() => ({ db: undefined as AuthDatabase | undefined }));

vi.mock("@/lib/auth/store-repository", () => ({
    mutateAuthDb: vi.fn(async (handler: (db: AuthDatabase) => unknown) => handler(mocks.db!)),
    readAuthDb: vi.fn(async () => mocks.db!),
}));
vi.mock("@/lib/auth/store-settings-actions", () => ({ getAuthSettings: vi.fn(async () => mocks.db!.settings) }));
vi.mock("@/lib/server/database", () => ({
    createPostgresRepositories: vi.fn(),
    ensurePostgresSchema: vi.fn(),
    isPostgresDatabaseEnabled: vi.fn(() => false),
    withPostgresTransaction: vi.fn(),
}));

import { hashPassword } from "@/lib/auth/password";
import { emptyDb } from "@/lib/auth/store-normalizers";
import { AdminMfaChallengeError, beginAdminMfaSetup, disableAdminMfa, enableAdminMfa, verifyAdminMfaForLogin } from "./admin-mfa-service";

describe("administrator MFA service", () => {
    beforeEach(async () => {
        process.env.VOZEB_PRO_ENCRYPTION_KEY = "1".repeat(64);
        const db = emptyDb();
        db.users.push({
            id: "admin-one",
            accountId: "0001",
            username: "admin",
            displayName: "管理员",
            bio: "",
            role: "admin",
            adminPermissions: [],
            status: "active",
            planId: "free",
            pointsBalance: 0,
            passwordHash: await hashPassword("admin-password"),
            createdAt: "2026-08-09T00:00:00.000Z",
            updatedAt: "2026-08-09T00:00:00.000Z",
        });
        db.sessions.push(
            { id: "current-session", userId: "admin-one", tokenHash: "current", createdAt: "2026-08-09T00:00:00.000Z", expiresAt: "2026-09-09T00:00:00.000Z" },
            { id: "other-session", userId: "admin-one", tokenHash: "other", createdAt: "2026-08-09T00:00:00.000Z", expiresAt: "2026-09-09T00:00:00.000Z" },
        );
        mocks.db = db;
    });

    it("stores an encrypted secret, challenges login, and revokes other sessions", async () => {
        const setup = await beginAdminMfaSetup("admin-one", "admin-password");
        const stored = mocks.db!.users[0];
        expect(stored.mfaSecretCiphertext).toMatch(/^vozeb-pro-secret:v1:/);
        expect(stored.mfaSecretCiphertext).not.toContain(setup.secret);
        expect(stored.mfaEnabledAt).toBeUndefined();

        const authenticator = OTPAuth.URI.parse(setup.uri) as OTPAuth.TOTP;
        const token = authenticator.generate();
        const enabled = await enableAdminMfa("admin-one", token, "current-session");
        expect(enabled.mfaEnabled).toBe(true);
        expect(mocks.db!.sessions.map((session) => session.id)).toEqual(["current-session"]);
        expect(() => verifyAdminMfaForLogin(stored, undefined)).toThrow(AdminMfaChallengeError);
        expect(() => verifyAdminMfaForLogin(stored, "not-a-token")).toThrow("动态验证码不正确");
        expect(() => verifyAdminMfaForLogin(stored, authenticator.generate())).not.toThrow();
    });

    it("requires the current password and TOTP before clearing MFA", async () => {
        const setup = await beginAdminMfaSetup("admin-one", "admin-password");
        const authenticator = OTPAuth.URI.parse(setup.uri) as OTPAuth.TOTP;
        await enableAdminMfa("admin-one", authenticator.generate(), "current-session");
        mocks.db!.sessions.push({ id: "new-other-session", userId: "admin-one", tokenHash: "other", createdAt: "2026-08-09T00:00:00.000Z", expiresAt: "2026-09-09T00:00:00.000Z" });

        await expect(disableAdminMfa("admin-one", { currentPassword: "wrong", token: authenticator.generate(), currentSessionId: "current-session" })).rejects.toThrow("当前密码不正确");
        const disabled = await disableAdminMfa("admin-one", { currentPassword: "admin-password", token: authenticator.generate(), currentSessionId: "current-session" });
        expect(disabled.mfaEnabled).toBe(false);
        expect(mocks.db!.users[0].mfaSecretCiphertext).toBeUndefined();
        expect(mocks.db!.users[0].mfaEnabledAt).toBeUndefined();
        expect(mocks.db!.sessions.map((session) => session.id)).toEqual(["current-session"]);
    });

    it("does not require MFA for regular users", () => {
        expect(() => verifyAdminMfaForLogin({ ...mocks.db!.users[0], role: "user", mfaEnabledAt: new Date().toISOString(), mfaSecretCiphertext: "invalid" }, undefined)).not.toThrow();
    });
});
