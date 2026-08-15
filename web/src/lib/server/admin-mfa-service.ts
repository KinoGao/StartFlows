import * as OTPAuth from "otpauth";

import { verifyPassword } from "@/lib/auth/password";
import { AuthInputError } from "@/lib/auth/store-foundation";
import { mutateAuthDb, readAuthDb } from "@/lib/auth/store-repository";
import { getAuthSettings } from "@/lib/auth/store-settings-actions";
import type { PublicUser, StoredUser } from "@/lib/auth/store-types";
import { publicUserFromAuthenticatedRecord, toPublicUser } from "@/lib/auth/store-user-projection";
import { createPostgresRepositories, ensurePostgresSchema, isPostgresDatabaseEnabled, withPostgresTransaction } from "@/lib/server/database";
import { walletClock } from "@/lib/server/points-wallet-service";
import { decryptSecretValue, encryptSecretValue } from "@/lib/server/secret-crypto";

type AdminMfaUser = {
    id: string;
    username: string;
    role: "admin" | "user";
    status: "active" | "disabled";
    passwordHash: string;
    mfaSecretCiphertext?: string;
    mfaEnabledAt?: string;
    updatedAt: string;
};

export class AdminMfaChallengeError extends AuthInputError {
    constructor() {
        super("请输入动态验证码", 401);
    }
}

export function isAdminMfaChallengeError(error: unknown): error is AdminMfaChallengeError {
    return error instanceof AdminMfaChallengeError;
}

export function verifyAdminMfaForLogin(user: AdminMfaUser, token: unknown) {
    if (user.role !== "admin" || !user.mfaEnabledAt) return;
    if (!user.mfaSecretCiphertext) throw new Error("管理员 MFA 状态不完整，请通过服务器恢复命令重置 MFA");
    const value = normalizeToken(token);
    if (!value) throw new AdminMfaChallengeError();
    if (!validateToken(user.mfaSecretCiphertext, value)) throw new AuthInputError("动态验证码不正确", 401);
}

export async function beginAdminMfaSetup(userId: string, currentPassword: string) {
    const secret = new OTPAuth.Secret();
    const secretBase32 = secret.base32;
    const secretCiphertext = encryptSecretValue(secretBase32);
    let username: string;
    if (isPostgresDatabaseEnabled()) {
        await ensurePostgresSchema();
        username = await withPostgresTransaction(async (client) => {
            const users = createPostgresRepositories(client).users;
            const user = await requireSetupAllowed(await users.getById(userId, true), currentPassword);
            await users.update(userId, { mfaSecretCiphertext: secretCiphertext, mfaEnabledAt: null });
            return user.username;
        });
    } else {
        username = await mutateAuthDb(async (db) => {
            const user = await requireSetupAllowed(
                db.users.find((item) => item.id === userId),
                currentPassword,
            );
            user.mfaSecretCiphertext = secretCiphertext;
            user.mfaEnabledAt = undefined;
            user.updatedAt = new Date().toISOString();
            return user.username;
        });
    }
    const settings = await getAuthSettings();
    const totp = new OTPAuth.TOTP({ issuer: settings.site.title, label: username, secret });
    return { secret: secretBase32, uri: totp.toString() };
}

export async function enableAdminMfa(userId: string, token: unknown, currentSessionId: string): Promise<PublicUser> {
    const value = requiredToken(token);
    if (!currentSessionId) throw new AuthInputError("登录会话无效，请重新登录", 401);
    if (isPostgresDatabaseEnabled()) {
        await ensurePostgresSchema();
        const clock = walletClock();
        return withPostgresTransaction(async (client) => {
            const repos = createPostgresRepositories(client);
            const user = await repos.users.getById(userId, true);
            assertActiveAdmin(user);
            if (user.mfaEnabledAt) throw new AuthInputError("管理员 MFA 已启用");
            if (!user.mfaSecretCiphertext) throw new AuthInputError("请先开始 MFA 设置");
            if (!validateToken(user.mfaSecretCiphertext, value)) throw new AuthInputError("动态验证码不正确");
            await repos.users.update(userId, { mfaEnabledAt: clock.now.toISOString() });
            await repos.sessions.deleteByUserIdExcept(userId, currentSessionId);
            const record = (await repos.users.getPublicDetails([userId], { now: clock.now.toISOString(), date: clock.date }))[0];
            if (!record) throw new AuthInputError("用户不可用");
            return publicUserFromAuthenticatedRecord(record, clock.expiresAt);
        });
    }
    return mutateAuthDb((db) => {
        const user = db.users.find((item) => item.id === userId);
        assertActiveAdmin(user);
        if (user.mfaEnabledAt) throw new AuthInputError("管理员 MFA 已启用");
        if (!user.mfaSecretCiphertext) throw new AuthInputError("请先开始 MFA 设置");
        if (!validateToken(user.mfaSecretCiphertext, value)) throw new AuthInputError("动态验证码不正确");
        user.mfaEnabledAt = new Date().toISOString();
        user.updatedAt = user.mfaEnabledAt;
        db.sessions = db.sessions.filter((session) => session.userId !== userId || session.id === currentSessionId);
        return toPublicUser(user, db);
    });
}

export async function disableAdminMfa(userId: string, input: { currentPassword: string; token: unknown; currentSessionId: string }): Promise<PublicUser> {
    const value = requiredToken(input.token);
    if (!input.currentSessionId) throw new AuthInputError("登录会话无效，请重新登录", 401);
    if (isPostgresDatabaseEnabled()) {
        await ensurePostgresSchema();
        const clock = walletClock();
        return withPostgresTransaction(async (client) => {
            const repos = createPostgresRepositories(client);
            const user = await repos.users.getById(userId, true);
            assertActiveAdmin(user);
            await assertPassword(user, input.currentPassword);
            assertEnabledMfa(user, value);
            await repos.users.update(userId, { mfaSecretCiphertext: null, mfaEnabledAt: null });
            await repos.sessions.deleteByUserIdExcept(userId, input.currentSessionId);
            const record = (await repos.users.getPublicDetails([userId], { now: clock.now.toISOString(), date: clock.date }))[0];
            if (!record) throw new AuthInputError("用户不可用");
            return publicUserFromAuthenticatedRecord(record, clock.expiresAt);
        });
    }
    return mutateAuthDb(async (db) => {
        const user = db.users.find((item) => item.id === userId);
        assertActiveAdmin(user);
        await assertPassword(user, input.currentPassword);
        assertEnabledMfa(user, value);
        user.mfaSecretCiphertext = undefined;
        user.mfaEnabledAt = undefined;
        user.updatedAt = new Date().toISOString();
        db.sessions = db.sessions.filter((session) => session.userId !== userId || session.id === input.currentSessionId);
        return toPublicUser(user, db);
    });
}

async function requireSetupAllowed(user: AdminMfaUser | undefined | null, currentPassword: string) {
    assertActiveAdmin(user);
    await assertPassword(user, currentPassword);
    if (user.mfaEnabledAt) throw new AuthInputError("请先关闭当前 MFA，再重新设置");
    return user;
}

function assertActiveAdmin(user: AdminMfaUser | undefined | null): asserts user is AdminMfaUser {
    if (!user || user.status !== "active") throw new AuthInputError("用户不可用", 401);
    if (user.role !== "admin") throw new AuthInputError("只有管理员可以设置 MFA", 403);
}

async function assertPassword(user: AdminMfaUser, password: string) {
    if (!(await verifyPassword(password, user.passwordHash))) throw new AuthInputError("当前密码不正确");
}

function assertEnabledMfa(user: AdminMfaUser, token: string) {
    if (!user.mfaEnabledAt || !user.mfaSecretCiphertext) throw new AuthInputError("管理员 MFA 尚未启用");
    if (!validateToken(user.mfaSecretCiphertext, token)) throw new AuthInputError("动态验证码不正确");
}

function requiredToken(token: unknown) {
    const value = normalizeToken(token);
    if (!value) throw new AuthInputError("请输入动态验证码");
    return value;
}

function normalizeToken(token: unknown) {
    return typeof token === "string" ? token.trim() : "";
}

function validateToken(secretCiphertext: string, token: string) {
    const secret = OTPAuth.Secret.fromBase32(decryptSecretValue(secretCiphertext));
    return new OTPAuth.TOTP({ secret }).validate({ token }) !== null;
}
