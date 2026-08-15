import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    verifyPassword: vi.fn(),
    readLatest: vi.fn(),
    create: vi.fn(),
    withdraw: vi.fn(),
    list: vi.fn(),
    review: vi.fn(),
    revert: vi.fn(),
    updateUserByAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({
    isAuthInputError: vi.fn(() => false),
    updateUserByAdmin: mocks.updateUserByAdmin,
    verifyUserPasswordForSensitiveAction: mocks.verifyPassword,
}));
vi.mock("@/lib/server/auth-mutation-lock", () => ({ lockAuthMutation: vi.fn() }));
vi.mock("@/lib/server/database", () => ({
    createPostgresRepositories: vi.fn(),
    ensurePostgresSchema: vi.fn(),
    isPostgresDatabaseEnabled: vi.fn(() => false),
    withPostgresTransaction: vi.fn(),
}));
vi.mock("@/lib/server/database/account-deletion-request-repository", () => ({
    readLatestAccountDeletionRequestForUser: mocks.readLatest,
    createAccountDeletionRequest: mocks.create,
    withdrawPendingAccountDeletionRequest: mocks.withdraw,
    listAccountDeletionRequests: mocks.list,
    reviewPendingAccountDeletionRequest: mocks.review,
    revertAcceptedAccountDeletionRequest: mocks.revert,
}));

import { reviewAccountDeletionRequest, submitAccountDeletionRequest, withdrawOwnAccountDeletionRequest } from "./account-deletion-request-service";

const user = { id: "user-one", accountId: "0001", username: "creator", displayName: "创作者", email: "creator@example.com" };
const stored = {
    id: "request-one",
    userId: user.id,
    accountId: user.accountId,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    status: "pending" as const,
    note: "不再使用",
    reviewNote: "",
    requestedAt: "2026-07-25T00:00:00.000Z",
    updatedAt: "2026-07-25T00:00:00.000Z",
};

describe("account deletion request service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.readLatest.mockResolvedValue(null);
        mocks.create.mockResolvedValue(stored);
        mocks.withdraw.mockResolvedValue({ ...stored, status: "withdrawn", handledAt: stored.updatedAt });
        mocks.review.mockResolvedValue({ ...stored, status: "accepted", reviewNote: "进入人工核验", reviewedByUserId: "admin-one", reviewedByUsername: "admin", handledAt: stored.updatedAt });
        mocks.revert.mockResolvedValue(true);
        mocks.updateUserByAdmin.mockResolvedValue({ id: user.id, status: "disabled" });
    });

    it("verifies the current password and creates one pending request", async () => {
        const result = await submitAccountDeletionRequest(user, { currentPassword: "secret", note: " 不再使用 " });

        expect(mocks.verifyPassword).toHaveBeenCalledWith(user.id, "secret");
        expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ userId: user.id, status: "pending", note: "不再使用" }));
        expect(result).toMatchObject({ id: stored.id, status: "pending" });
    });

    it("rejects duplicate pending or accepted requests", async () => {
        mocks.readLatest.mockResolvedValueOnce(stored);
        await expect(submitAccountDeletionRequest(user, { currentPassword: "secret" })).rejects.toMatchObject({ status: 409 });

        mocks.readLatest.mockResolvedValueOnce({ ...stored, status: "accepted" });
        await expect(submitAccountDeletionRequest(user, { currentPassword: "secret" })).rejects.toThrow("正在处理中");
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it("only withdraws a pending request", async () => {
        await expect(withdrawOwnAccountDeletionRequest(user.id)).resolves.toMatchObject({ status: "withdrawn" });
        mocks.withdraw.mockResolvedValueOnce(null);
        await expect(withdrawOwnAccountDeletionRequest(user.id)).rejects.toMatchObject({ status: 409 });
    });

    it("requires an administrator note and refuses stale reviews", async () => {
        await expect(reviewAccountDeletionRequest({ id: stored.id, status: "accepted", reviewNote: "", reviewer: { id: "admin-one", username: "admin" } })).rejects.toThrow("处理备注");

        mocks.review.mockResolvedValueOnce(null);
        await expect(reviewAccountDeletionRequest({ id: stored.id, status: "rejected", reviewNote: "身份信息不足", reviewer: { id: "admin-one", username: "admin" } })).rejects.toMatchObject({ status: 409 });
    });

    it("disables login and revokes sessions when an administrator accepts deletion", async () => {
        await expect(reviewAccountDeletionRequest({ id: stored.id, status: "accepted", reviewNote: "已核验并停止账号访问", reviewer: { id: "admin-one", username: "admin" } })).resolves.toMatchObject({ status: "accepted" });

        expect(mocks.updateUserByAdmin).toHaveBeenCalledWith("admin-one", user.id, { status: "disabled" });
        expect(mocks.revert).not.toHaveBeenCalled();
    });

    it("reopens the request if the file-provider access update cannot complete", async () => {
        mocks.updateUserByAdmin.mockRejectedValueOnce(new Error("disk full"));

        await expect(reviewAccountDeletionRequest({ id: stored.id, status: "accepted", reviewNote: "已核验", reviewer: { id: "admin-one", username: "admin" } })).rejects.toThrow("disk full");
        expect(mocks.revert).toHaveBeenCalledWith(expect.objectContaining({ id: stored.id, reviewedByUserId: "admin-one" }));
    });
});
