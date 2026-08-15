import { apiError, apiSuccess } from "@/app/api/_shared/api-response";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentSessionId, getCurrentUser } from "@/lib/auth/session";
import { isAuthInputError } from "@/lib/auth/store";
import type { PublicUser } from "@/lib/auth/store-types";
import { beginAdminMfaSetup, disableAdminMfa, enableAdminMfa } from "@/lib/server/admin-mfa-service";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { AUTH_LOGIN_RATE_LIMIT, checkAuthRateLimit, rateLimitHeaders } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return apiError(401, "请先登录", { headers: privateHeaders });
    const limited = await checkMfaRateLimit(request, currentUser.username);
    if (limited) return limited;
    try {
        const body = await readJsonBody<{ currentPassword?: unknown }>(request);
        const data = await beginAdminMfaSetup(currentUser.id, typeof body.currentPassword === "string" ? body.currentPassword : "");
        await recordMfaAudit(request, currentUser, "auth.mfa.setup");
        return apiSuccess(data, "MFA 设置已创建", { headers: privateHeaders });
    } catch (error) {
        await recordMfaAudit(request, currentUser, "auth.mfa.setup", error);
        return mfaError(error, "创建 MFA 设置失败");
    }
}

export async function PATCH(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return apiError(401, "请先登录", { headers: privateHeaders });
    const limited = await checkMfaRateLimit(request, currentUser.username);
    if (limited) return limited;
    try {
        const body = await readJsonBody<{ token?: unknown }>(request);
        const user = await enableAdminMfa(currentUser.id, body.token, (await getCurrentSessionId()) || "");
        await recordMfaAudit(request, currentUser, "auth.mfa.enable");
        return apiSuccess({ user }, "管理员 MFA 已启用", { headers: privateHeaders });
    } catch (error) {
        await recordMfaAudit(request, currentUser, "auth.mfa.enable", error);
        return mfaError(error, "启用管理员 MFA 失败");
    }
}

export async function DELETE(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return apiError(401, "请先登录", { headers: privateHeaders });
    const limited = await checkMfaRateLimit(request, currentUser.username);
    if (limited) return limited;
    try {
        const body = await readJsonBody<{ currentPassword?: unknown; token?: unknown }>(request);
        const user = await disableAdminMfa(currentUser.id, {
            currentPassword: typeof body.currentPassword === "string" ? body.currentPassword : "",
            token: body.token,
            currentSessionId: (await getCurrentSessionId()) || "",
        });
        await recordMfaAudit(request, currentUser, "auth.mfa.disable");
        return apiSuccess({ user }, "管理员 MFA 已关闭", { headers: privateHeaders });
    } catch (error) {
        await recordMfaAudit(request, currentUser, "auth.mfa.disable", error);
        return mfaError(error, "关闭管理员 MFA 失败");
    }
}

async function checkMfaRateLimit(request: Request, username: string) {
    const limit = await checkAuthRateLimit("admin-mfa", request, username, AUTH_LOGIN_RATE_LIMIT);
    return limit.allowed ? null : apiError(429, "操作过于频繁，请稍后再试", { headers: { ...privateHeaders, ...rateLimitHeaders(limit) } });
}

function recordMfaAudit(request: Request, user: PublicUser, action: string, error?: unknown) {
    return safeRecordAuditLog({
        action,
        status: error ? "failure" : "success",
        actor: auditActorFromRequest(request, user),
        target: { type: "user", id: user.id, label: user.username },
        ...(error ? { metadata: { reason: error instanceof Error ? error.message : "unknown" } } : {}),
    });
}

function mfaError(error: unknown, fallback: string) {
    if (isAuthInputError(error)) return apiError(error.status, error.message, { headers: privateHeaders });
    console.error(fallback, error);
    return apiError(500, fallback, { headers: privateHeaders });
}
