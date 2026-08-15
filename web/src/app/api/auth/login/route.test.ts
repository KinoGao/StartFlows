import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    authenticateUser: vi.fn(),
    createSession: vi.fn(),
    setSessionCookie: vi.fn(),
    safeRecordAuditLog: vi.fn(),
    checkAuthRateLimit: vi.fn(),
    safeGetLoginSecurityNotice: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({
    authenticateUser: mocks.authenticateUser,
    createSession: mocks.createSession,
    isAuthInputError: (error: unknown) => Boolean(error && typeof error === "object" && "status" in error),
}));
vi.mock("@/lib/auth/session", () => ({ serializeCurrentUser: vi.fn((user) => user), setSessionCookie: mocks.setSessionCookie }));
vi.mock("@/lib/server/audit-log-store", () => ({
    auditActorFromRequest: vi.fn((_request, user) => ({ ...user, ip: "203.0.113.11", userAgent: "Browser B" })),
    safeGetLoginSecurityNotice: mocks.safeGetLoginSecurityNotice,
    safeRecordAuditLog: mocks.safeRecordAuditLog,
}));
vi.mock("@/lib/server/security", () => ({ AUTH_LOGIN_RATE_LIMIT: { maxRequests: 8, windowMs: 1 }, checkAuthRateLimit: mocks.checkAuthRateLimit }));

import { AdminMfaChallengeError } from "@/lib/server/admin-mfa-service";
import { POST } from "./route";

describe("POST /api/auth/login administrator MFA", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.checkAuthRateLimit.mockResolvedValue({ allowed: true, remaining: 1, resetAt: Date.now() });
        mocks.safeGetLoginSecurityNotice.mockResolvedValue(undefined);
    });

    it("returns a security notice when the successful login environment changed", async () => {
        mocks.authenticateUser.mockResolvedValue({ id: "admin-one", username: "admin", role: "admin" });
        mocks.createSession.mockResolvedValue("session.token");
        mocks.safeGetLoginSecurityNotice.mockResolvedValue({ networkChanged: true, deviceChanged: false, previousLoginAt: "2026-08-09T10:00:00.000Z" });

        const response = await POST(loginRequest({ username: "admin", password: "password", totpCode: "123456" }));

        expect(await response.json()).toMatchObject({ securityNotice: { networkChanged: true, deviceChanged: false } });
        expect(mocks.safeGetLoginSecurityNotice).toHaveBeenCalledWith("admin-one", expect.objectContaining({ ip: "203.0.113.11", userAgent: "Browser B" }));
    });

    it("returns a challenge without creating a session after password verification", async () => {
        mocks.authenticateUser.mockRejectedValue(new AdminMfaChallengeError());
        const response = await POST(loginRequest({ username: "admin", password: "password" }));

        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ mfaRequired: true });
        expect(mocks.createSession).not.toHaveBeenCalled();
        expect(mocks.safeRecordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.login.mfa_challenge" }));
    });

    it("forwards the TOTP code and only creates a session after full authentication", async () => {
        mocks.authenticateUser.mockResolvedValue({ id: "admin-one", username: "admin", role: "admin" });
        mocks.createSession.mockResolvedValue("session.token");
        const response = await POST(loginRequest({ username: "admin", password: "password", totpCode: "123456" }));

        expect(response.status).toBe(200);
        expect(mocks.authenticateUser).toHaveBeenCalledWith({ username: "admin", password: "password", totpCode: "123456" });
        expect(mocks.createSession).toHaveBeenCalledWith("admin-one");
        expect(mocks.setSessionCookie).toHaveBeenCalled();
    });
});

function loginRequest(body: Record<string, string>) {
    return new Request("http://localhost/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
