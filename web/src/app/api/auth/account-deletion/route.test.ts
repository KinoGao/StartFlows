import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    user: vi.fn(),
    getOwn: vi.fn(),
    submit: vi.fn(),
    withdraw: vi.fn(),
    rateLimit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/store", () => ({ isAuthInputError: vi.fn(() => false) }));
vi.mock("@/lib/server/account-deletion-request-service", () => ({
    AccountDeletionRequestError: class AccountDeletionRequestError extends Error {
        constructor(
            message: string,
            readonly status = 400,
        ) {
            super(message);
        }
    },
    getOwnAccountDeletionRequest: mocks.getOwn,
    submitAccountDeletionRequest: mocks.submit,
    withdrawOwnAccountDeletionRequest: mocks.withdraw,
}));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: vi.fn() }));
vi.mock("@/lib/server/security", () => ({ checkRateLimit: mocks.rateLimit, rateLimitHeaders: vi.fn(() => ({})) }));

import { DELETE, GET, POST } from "./route";

describe("account deletion user API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.user.mockResolvedValue({ id: "user-one", username: "creator", role: "user" });
        mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 4, resetAt: Date.now() + 1000 });
        mocks.getOwn.mockResolvedValue(null);
        mocks.submit.mockResolvedValue({ id: "request-one", status: "pending" });
        mocks.withdraw.mockResolvedValue({ id: "request-one", status: "withdrawn" });
    });

    it("requires login for all actions", async () => {
        mocks.user.mockResolvedValue(null);
        expect((await GET()).status).toBe(401);
        expect((await DELETE(new Request("http://localhost/api/auth/account-deletion", { method: "DELETE" }))).status).toBe(401);
    });

    it("passes password and note to the service", async () => {
        const response = await POST(new Request("http://localhost/api/auth/account-deletion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: "secret", note: "reason" }) }));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ code: 0, data: { id: "request-one", status: "pending" }, msg: "注销申请已提交" });
        expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({ id: "user-one" }), { currentPassword: "secret", note: "reason" });
    });
});
