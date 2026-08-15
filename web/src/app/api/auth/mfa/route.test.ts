import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    beginAdminMfaSetup: vi.fn(),
    disableAdminMfa: vi.fn(),
    enableAdminMfa: vi.fn(),
    getCurrentSessionId: vi.fn(),
    getCurrentUser: vi.fn(),
    safeRecordAuditLog: vi.fn(),
    checkAuthRateLimit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentSessionId: mocks.getCurrentSessionId, getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({ isAuthInputError: (error: unknown) => Boolean(error && typeof error === "object" && "status" in error) }));
vi.mock("@/lib/server/admin-mfa-service", () => ({ beginAdminMfaSetup: mocks.beginAdminMfaSetup, disableAdminMfa: mocks.disableAdminMfa, enableAdminMfa: mocks.enableAdminMfa }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn((_request, user) => user), safeRecordAuditLog: mocks.safeRecordAuditLog }));
vi.mock("@/lib/server/security", () => ({
    AUTH_LOGIN_RATE_LIMIT: { maxRequests: 8, windowMs: 1 },
    checkAuthRateLimit: mocks.checkAuthRateLimit,
    rateLimitHeaders: vi.fn(() => ({})),
}));

import { DELETE, PATCH, POST } from "./route";

const admin = { id: "admin-one", username: "admin", role: "admin", status: "active" };

describe("/api/auth/mfa", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue(admin);
        mocks.getCurrentSessionId.mockResolvedValue("current-session");
        mocks.checkAuthRateLimit.mockResolvedValue({ allowed: true, remaining: 1, resetAt: Date.now() });
    });

    it("returns a no-store setup secret only after the service accepts the current password", async () => {
        mocks.beginAdminMfaSetup.mockResolvedValue({ secret: "BASE32", uri: "otpauth://totp/example" });
        const response = await POST(request("POST", { currentPassword: "password" }));

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(await response.json()).toMatchObject({ code: 0, data: { secret: "BASE32", uri: "otpauth://totp/example" } });
        expect(mocks.beginAdminMfaSetup).toHaveBeenCalledWith("admin-one", "password");
        expect(mocks.safeRecordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "auth.mfa.setup", status: "success" }));
    });

    it("binds enable and disable operations to the current session", async () => {
        mocks.enableAdminMfa.mockResolvedValue({ ...admin, mfaEnabled: true });
        mocks.disableAdminMfa.mockResolvedValue({ ...admin, mfaEnabled: false });

        expect((await PATCH(request("PATCH", { token: "123456" }))).status).toBe(200);
        expect(mocks.enableAdminMfa).toHaveBeenCalledWith("admin-one", "123456", "current-session");
        expect((await DELETE(request("DELETE", { currentPassword: "password", token: "123456" }))).status).toBe(200);
        expect(mocks.disableAdminMfa).toHaveBeenCalledWith("admin-one", { currentPassword: "password", token: "123456", currentSessionId: "current-session" });
    });

    it("rejects unauthenticated setup without reading the request body", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        const response = await POST(request("POST", { currentPassword: "password" }));
        expect(response.status).toBe(401);
        expect(mocks.beginAdminMfaSetup).not.toHaveBeenCalled();
    });
});

function request(method: string, body: unknown) {
    return new Request("http://localhost/api/auth/mfa", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
