import { randomUUID } from "node:crypto";

import type { AccountDeletionRequestStatus, AccountDeletionRequestView, AdminAccountDeletionRequest } from "@/lib/account-deletion-contract";
import type { PublicUser } from "@/lib/auth/store";
import { isAuthInputError, updateUserByAdmin, verifyUserPasswordForSensitiveAction } from "@/lib/auth/store";
import { lockAuthMutation } from "@/lib/server/auth-mutation-lock";
import { createPostgresRepositories, ensurePostgresSchema, isPostgresDatabaseEnabled, withPostgresTransaction } from "@/lib/server/database";
import {
    createAccountDeletionRequest,
    listAccountDeletionRequests,
    readLatestAccountDeletionRequestForUser,
    revertAcceptedAccountDeletionRequest,
    reviewPendingAccountDeletionRequest,
    type StoredAccountDeletionRequest,
    withdrawPendingAccountDeletionRequest,
} from "@/lib/server/database/account-deletion-request-repository";

export class AccountDeletionRequestError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
    }
}

export async function getOwnAccountDeletionRequest(userId: string): Promise<AccountDeletionRequestView | null> {
    const request = await readLatestAccountDeletionRequestForUser(userId);
    return request ? toUserView(request) : null;
}

export async function submitAccountDeletionRequest(user: Pick<PublicUser, "id" | "accountId" | "username" | "displayName" | "email">, input: { currentPassword: string; note?: string }) {
    if (!input.currentPassword) throw new AccountDeletionRequestError("请输入当前密码");
    await verifyUserPasswordForSensitiveAction(user.id, input.currentPassword);
    const latest = await readLatestAccountDeletionRequestForUser(user.id);
    if (latest?.status === "pending") throw new AccountDeletionRequestError("已有待处理的注销申请", 409);
    if (latest?.status === "accepted") throw new AccountDeletionRequestError("注销申请已受理，正在处理中", 409);

    const now = new Date().toISOString();
    const created = await createAccountDeletionRequest({
        id: randomUUID(),
        userId: user.id,
        accountId: user.accountId,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        status: "pending",
        note: normalizeText(input.note, 500),
        reviewNote: "",
        requestedAt: now,
        updatedAt: now,
    });
    if (!created) throw new AccountDeletionRequestError("已有待处理的注销申请", 409);
    return toUserView(created);
}

export async function withdrawOwnAccountDeletionRequest(userId: string) {
    const request = await withdrawPendingAccountDeletionRequest(userId, new Date().toISOString());
    if (!request) throw new AccountDeletionRequestError("没有可撤回的待处理申请", 409);
    return toUserView(request);
}

export async function listAdminAccountDeletionRequests(input: { page?: number; pageSize?: number; keyword?: string; status?: AccountDeletionRequestStatus }) {
    const result = await listAccountDeletionRequests(input);
    return { ...result, items: result.items.map(toAdminView) };
}

export async function reviewAccountDeletionRequest(input: { id: string; status: "accepted" | "rejected"; reviewNote: string; reviewer: Pick<PublicUser, "id" | "username"> }) {
    const reviewNote = normalizeText(input.reviewNote, 1000);
    if (!reviewNote) throw new AccountDeletionRequestError("请填写处理备注");
    const reviewInput: Parameters<typeof reviewPendingAccountDeletionRequest>[0] = {
        id: input.id,
        status: input.status,
        reviewNote,
        reviewedByUserId: input.reviewer.id,
        reviewedByUsername: input.reviewer.username,
        updatedAt: new Date().toISOString(),
    };
    const request = input.status === "accepted" ? await acceptAccountDeletionRequest(reviewInput, input.reviewer.id) : await reviewPendingAccountDeletionRequest(reviewInput);
    if (!request) throw new AccountDeletionRequestError("申请不存在或已处理", 409);
    return toAdminView(request);
}

async function acceptAccountDeletionRequest(reviewInput: Parameters<typeof reviewPendingAccountDeletionRequest>[0], reviewerId: string) {
    if (isPostgresDatabaseEnabled()) {
        await ensurePostgresSchema();
        return withPostgresTransaction(async (client) => {
            await lockAuthMutation(client);
            const request = await reviewPendingAccountDeletionRequest(reviewInput, client);
            if (!request) return null;
            if (request.userId === reviewerId) throw new AccountDeletionRequestError("不能受理当前登录账号自己的注销申请", 409);
            const repos = createPostgresRepositories(client);
            const user = await repos.users.getById(request.userId, true);
            if (!user) throw new AccountDeletionRequestError("申请账号不存在", 409);
            if (user.role === "admin") {
                const activeAdminIds = await repos.users.lockActiveAdminIds();
                if (!activeAdminIds.some((id) => id !== user.id)) throw new AccountDeletionRequestError("至少需要保留一个可用管理员", 409);
            }
            await repos.users.update(user.id, { status: "disabled" });
            await repos.sessions.deleteByUserId(user.id);
            return request;
        });
    }

    const request = await reviewPendingAccountDeletionRequest(reviewInput);
    if (!request) return null;
    try {
        await updateUserByAdmin(reviewerId, request.userId, { status: "disabled" });
        return request;
    } catch (error) {
        await revertAcceptedAccountDeletionRequest({ id: request.id, reviewedByUserId: reviewerId, updatedAt: new Date().toISOString() });
        if (isAuthInputError(error)) throw new AccountDeletionRequestError(error.message, error.status);
        throw error;
    }
}

function toUserView(request: StoredAccountDeletionRequest): AccountDeletionRequestView {
    return {
        id: request.id,
        status: request.status,
        note: request.note,
        reviewNote: request.reviewNote,
        requestedAt: request.requestedAt,
        updatedAt: request.updatedAt,
        handledAt: request.handledAt,
    };
}

function toAdminView(request: StoredAccountDeletionRequest): AdminAccountDeletionRequest {
    return {
        ...toUserView(request),
        userId: request.userId,
        accountId: request.accountId,
        username: request.username,
        displayName: request.displayName,
        email: request.email,
        reviewedByUsername: request.reviewedByUsername,
    };
}

function normalizeText(value: unknown, maxLength: number) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}
