import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    user: vi.fn(),
    review: vi.fn(),
    audit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/server/account-deletion-request-service", () => ({
    AccountDeletionRequestError: class AccountDeletionRequestError extends Error {
        constructor(
            message: string,
            readonly status = 400,
        ) {
            super(message);
        }
    },
    reviewAccountDeletionRequest: mocks.review,
}));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: mocks.audit }));

import { PATCH } from "./route";

describe("administrator account deletion review API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.user.mockResolvedValue({ id: "admin-one", username: "admin", role: "admin", status: "active", adminPermissions: ["users.manage"] });
        mocks.review.mockResolvedValue({ id: "request-one", username: "creator", status: "accepted", reviewNote: "进入人工核验" });
    });

    it("requires an administrator", async () => {
        mocks.user.mockResolvedValueOnce(null);
        expect((await PATCH(request(), context())).status).toBe(401);
        mocks.user.mockResolvedValueOnce({ id: "user-one", role: "user" });
        expect((await PATCH(request(), context())).status).toBe(403);
        expect(mocks.review).not.toHaveBeenCalled();
    });

    it("passes the required review note and records an audit event", async () => {
        const response = await PATCH(request({ status: "accepted", reviewNote: "进入人工核验" }), context());

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ code: 0, data: { id: "request-one", username: "creator", status: "accepted", reviewNote: "进入人工核验" }, msg: "注销申请已受理" });
        expect(mocks.review).toHaveBeenCalledWith({ id: "request-one", status: "accepted", reviewNote: "进入人工核验", reviewer: expect.objectContaining({ id: "admin-one" }) });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.account_deletion.accept", target: expect.objectContaining({ id: "request-one" }) }));
    });
});

function request(body: object = { status: "accepted", reviewNote: "note" }) {
    return new Request("http://localhost/api/admin/account-deletion-requests/request-one", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function context() {
    return { params: Promise.resolve({ id: "request-one" }) };
}
