import { type AuthenticatedUserRecord } from "@/lib/server/database";
import { walletClock } from "@/lib/server/points-wallet-service";
import { userAvatarUrl } from "@/lib/user-avatar";

import { DEFAULT_ENTITLEMENT_SETTINGS } from "./store-foundation";
import { normalizePointAmount, normalizePoints, resolveDefaultPlan, resolveUserPlan } from "./store-normalizers";
import { type AuthDatabase, type PublicUser, type PublicUserSummary, type StoredUser, type UserRole, type UserStatus } from "./store-types";

export function toPublicUser(user: StoredUser, db?: Pick<AuthDatabase, "settings" | "dailyPlanPointWallets">): PublicUser {
    const plan = db ? resolveUserPlan(db, user) : DEFAULT_ENTITLEMENT_SETTINGS.plans[0];
    const clock = walletClock();
    const defaultPlan = db ? resolveDefaultPlan(db.settings.entitlements) : DEFAULT_ENTITLEMENT_SETTINGS.plans[0];
    const freePlan = plan.id === defaultPlan.id;
    const dailyEnabled = Boolean(plan.enabled && (!freePlan || db?.settings.freeDailyPointsEnabled));
    const wallet = dailyEnabled ? db?.dailyPlanPointWallets.find((item) => item.userId === user.id && item.date === clock.date) : undefined;
    const configuredDailyPoints = db && freePlan ? db.settings.freeDailyPoints : plan.dailyPoints;
    const dailyPoints = dailyEnabled ? (wallet?.remainingPoints ?? Math.max(0, normalizePoints(configuredDailyPoints, 0))) : 0;
    return buildPublicUser(
        user,
        { id: plan.id, name: plan.name, hasActivePlan: !freePlan },
        {
            permanentPoints: normalizePoints(user.pointsBalance, 0),
            dailyPoints,
            dailyPointsExpiresAt: clock.expiresAt,
        },
    );
}

export function publicUserFromAuthenticatedRecord(record: AuthenticatedUserRecord, dailyPointsExpiresAt = walletClock().expiresAt) {
    const fallbackPlan = DEFAULT_ENTITLEMENT_SETTINGS.plans[0];
    return buildPublicUser(
        record.user,
        { id: record.planId || fallbackPlan.id, name: record.planName || fallbackPlan.name, hasActivePlan: record.hasActivePlan },
        { permanentPoints: record.permanentPoints, dailyPoints: record.dailyPoints, dailyPointsExpiresAt },
    );
}

export function matchesPublicUser(user: PublicUser, input: { keyword: string; role?: UserRole; status?: UserStatus }) {
    if (input.role && user.role !== input.role) return false;
    if (input.status && user.status !== input.status) return false;
    if (!input.keyword) return true;
    return [user.accountId, user.displayName, user.username, user.email || "", user.role, user.status, user.role === "admin" ? "管理员" : "普通用户", user.status === "active" ? "可用" : "禁用"].some((value) => value.toLowerCase().includes(input.keyword));
}

export function summarizePublicUsers(users: PublicUser[], defaultPlanId: string): PublicUserSummary {
    return {
        total: users.length,
        active: users.filter((user) => user.status === "active").length,
        disabled: users.filter((user) => user.status === "disabled").length,
        admins: users.filter((user) => user.role === "admin").length,
        activeAdmins: users.filter((user) => user.role === "admin" && user.status === "active").length,
        usersWithPlan: users.filter((user) => user.planId !== defaultPlanId).length,
        totalPointsBalance: normalizePointAmount(
            users.reduce((total, user) => total + Math.max(0, user.pointsBalance), 0),
            0,
        ),
    };
}

function buildPublicUser(user: StoredUser, plan: { id: string; name: string; hasActivePlan: boolean }, wallet = { permanentPoints: normalizePoints(user.pointsBalance, 0), dailyPoints: 0, dailyPointsExpiresAt: walletClock().expiresAt }): PublicUser {
    const totalPoints = Math.max(0, normalizePointAmount(wallet.permanentPoints + wallet.dailyPoints, 0));
    return {
        id: user.id,
        accountId: user.accountId,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        bio: user.bio,
        avatarUrl: user.avatarStorageKey ? userAvatarUrl(user.id, user.updatedAt) : undefined,
        role: user.role,
        adminPermissions: [...user.adminPermissions],
        status: user.status,
        planId: plan.id,
        planName: plan.name,
        hasActivePlan: plan.hasActivePlan,
        pointsBalance: totalPoints,
        permanentPointsBalance: normalizePoints(wallet.permanentPoints, 0),
        dailyPointsBalance: Math.max(0, normalizePoints(wallet.dailyPoints, 0)),
        dailyPointsExpiresAt: wallet.dailyPointsExpiresAt,
        mfaEnabled: Boolean(user.mfaEnabledAt && user.mfaSecretCiphertext),
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
    };
}
