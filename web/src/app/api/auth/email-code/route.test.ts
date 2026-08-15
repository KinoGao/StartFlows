import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    checkAuthRateLimit: vi.fn(),
    createEmailVerificationCode: vi.fn(),
    getAuthSettings: vi.fn(),
    getCurrentUser: vi.fn(),
    readJsonBody: vi.fn(),
    sendSmtpMail: vi.fn(),
}));

vi.mock("@/lib/auth/request", () => ({ readJsonBody: mocks.readJsonBody }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({
    createEmailVerificationCode: mocks.createEmailVerificationCode,
    getAuthSettings: mocks.getAuthSettings,
    isAuthInputError: vi.fn(() => false),
}));
vi.mock("@/lib/mail/smtp", () => ({ sendSmtpMail: mocks.sendSmtpMail }));
vi.mock("@/lib/server/security", () => ({ checkAuthRateLimit: mocks.checkAuthRateLimit }));

import { POST } from "./route";

describe("POST /api/auth/email-code", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.checkAuthRateLimit.mockResolvedValue({ allowed: true, remaining: 4, resetAt: Date.now() + 60_000 });
        mocks.getCurrentUser.mockResolvedValue(null);
        mocks.readJsonBody.mockResolvedValue({ purpose: "password-reset", email: "person@example.com" });
        mocks.getAuthSettings.mockResolvedValue({ site: { title: "无限创作" }, mail: { host: "smtp.example.com" } });
        mocks.sendSmtpMail.mockResolvedValue(undefined);
    });

    it("returns the same success payload for an unknown password-reset email", async () => {
        mocks.createEmailVerificationCode.mockResolvedValue({ code: "123456", email: "person@example.com", deliverEmail: false });

        const response = await POST(new Request("http://localhost/api/auth/email-code", { method: "POST", headers: { "user-agent": "browser-one" } }));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ ok: true });
        expect(mocks.sendSmtpMail).not.toHaveBeenCalled();
        expect(mocks.getAuthSettings).not.toHaveBeenCalled();
    });

    it("uses the same success payload when the password-reset email is delivered", async () => {
        mocks.createEmailVerificationCode.mockResolvedValue({ code: "123456", email: "person@example.com", deliverEmail: true });

        const response = await POST(new Request("http://localhost/api/auth/email-code", { method: "POST", headers: { "user-agent": "browser-one" } }));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ ok: true });
        expect(mocks.sendSmtpMail).toHaveBeenCalledWith(expect.objectContaining({ to: "person@example.com" }));
        expect(mocks.sendSmtpMail).toHaveBeenCalledWith(
            expect.objectContaining({
                subject: "无限创作 重置密码验证码",
                text: expect.stringContaining("你的 无限创作 重置密码验证码是：123456"),
            }),
        );
    });
});
