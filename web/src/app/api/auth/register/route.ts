import { NextRequest, NextResponse } from "next/server";

import { createFirstAdmin, createSession, createUser, isAuthInputError } from "@/lib/auth/store";
import { readJsonBody } from "@/lib/auth/request";
import { serializeCurrentUser, setSessionCookie } from "@/lib/auth/session";
import { checkAuthRateLimit, getClientIp } from "@/lib/server/security";
import { getInstallStatus, invalidateInstallStatusCache } from "@/lib/server/install-status";
import { REFERRAL_COOKIE_NAME } from "@/lib/server/referral-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
    try {
        const install = await getInstallStatus();
        if (!install.ready && !install.firstAdminRequired) return NextResponse.json({ error: "请先完成数据库初始化并配置加密密钥" }, { status: 503 });
        const body = await readJsonBody<{ username?: string; email?: string; emailCode?: string; displayName?: string; password?: string; referralCode?: string; referralSource?: string; policyAccepted?: boolean; installToken?: string }>(request);
        const referralCodeProvided = Object.prototype.hasOwnProperty.call(body, "referralCode");
        const cookieReferralCode = request.cookies.get(REFERRAL_COOKIE_NAME)?.value;
        const referralCode = install.firstAdminRequired ? undefined : referralCodeProvided ? body.referralCode?.trim() || undefined : cookieReferralCode;
        const referralSource = referralCode ? body.referralSource?.trim() || (referralCodeProvided ? "registration-form" : "invite-link") : undefined;
        const registrationIdentity = String(body.username || body.email || "unknown")
            .trim()
            .toLowerCase()
            .slice(0, 160);
        const limit = await checkAuthRateLimit("register", request, registrationIdentity, { maxRequests: 10, windowMs: 60 * 60 * 1000 });
        if (!limit.allowed) return NextResponse.json({ error: "注册请求过于频繁，请稍后重试", retryAfter: Math.ceil((limit.resetAt - Date.now()) / 1000) }, { status: 429 });
        const user = install.firstAdminRequired
            ? await createFirstAdmin({ username: body.username || "", email: body.email, displayName: body.displayName, password: body.password || "", installToken: body.installToken })
            : await createUser({
                  username: body.username || "",
                  email: body.email,
                  emailCode: body.emailCode,
                  displayName: body.displayName,
                  password: body.password || "",
                  policyAccepted: body.policyAccepted === true,
                  referralCode,
                  referralSource,
                  referralClientIp: getClientIp(request),
              });
        if (install.firstAdminRequired) invalidateInstallStatusCache();
        const sessionValue = await createSession(user.id);
        const response = NextResponse.json({ user: serializeCurrentUser(user) });
        setSessionCookie(response, sessionValue, request);
        response.cookies.set(REFERRAL_COOKIE_NAME, "", { path: "/", maxAge: 0 });
        return response;
    } catch (error) {
        return authErrorResponse(error);
    }
}

function authErrorResponse(error: unknown) {
    if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Register failed", error);
    return NextResponse.json({ error: "注册失败，请稍后重试" }, { status: 500 });
}
