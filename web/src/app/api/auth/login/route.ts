import { NextResponse } from "next/server";

import { authenticateUser, createSession, isAuthInputError } from "@/lib/auth/store";
import { readJsonBody } from "@/lib/auth/request";
import { serializeCurrentUser, setSessionCookie } from "@/lib/auth/session";
import { auditActorFromRequest, safeGetLoginSecurityNotice, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { isAdminMfaChallengeError } from "@/lib/server/admin-mfa-service";
import { AUTH_LOGIN_RATE_LIMIT, checkAuthRateLimit } from "@/lib/server/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
    let username = "";

    try {
        const body = await readJsonBody<{ username?: string; password?: string; totpCode?: string }>(request);
        username = body.username || "";
        const limit = await checkAuthRateLimit("login", request, username, AUTH_LOGIN_RATE_LIMIT);
        if (!limit.allowed) {
            const retryAfter = Math.ceil((limit.resetAt - Date.now()) / 1000);
            await safeRecordAuditLog({
                action: "auth.login",
                status: "failure",
                actor: auditActorFromRequest(request, { username, role: "user" }),
                target: { type: "user", label: username },
                metadata: { reason: "rate_limited", retryAfter },
            });
            return NextResponse.json({ error: "登录请求过于频繁，请稍后重试", retryAfter }, { status: 429 });
        }

        const user = await authenticateUser({ username, password: body.password || "", totpCode: body.totpCode });
        const actor = auditActorFromRequest(request, user);
        const [sessionValue, securityNotice] = await Promise.all([createSession(user.id), safeGetLoginSecurityNotice(user.id, actor)]);
        const response = NextResponse.json({ user: serializeCurrentUser(user), securityNotice });
        setSessionCookie(response, sessionValue, request);
        await safeRecordAuditLog({
            action: "auth.login",
            actor,
            target: { type: "user", id: user.id, label: user.username },
        });
        return response;
    } catch (error) {
        if (isAdminMfaChallengeError(error)) {
            await safeRecordAuditLog({
                action: "auth.login.mfa_challenge",
                actor: auditActorFromRequest(request, { username, role: "admin" }),
                target: { type: "user", label: username },
            });
            return NextResponse.json({ error: error.message, mfaRequired: true }, { status: error.status });
        }
        await safeRecordAuditLog({
            action: "auth.login",
            status: "failure",
            actor: auditActorFromRequest(request, { username, role: "user" }),
            target: { type: "user", label: username },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Login failed", error);
        return NextResponse.json({ error: "登录失败，请稍后重试" }, { status: 500 });
    }
}
