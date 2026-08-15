import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { isAuthInputError, resetPasswordByEmail } from "@/lib/auth/store";
import { checkAuthRateLimit } from "@/lib/server/security";

export const runtime = "nodejs";

export async function POST(request: Request) {
    try {
        const body = await readJsonBody<{ email?: unknown; code?: unknown; newPassword?: unknown }>(request);
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const limit = await checkAuthRateLimit("password-reset", request, email, { maxRequests: 10, windowMs: 60 * 60 * 1000 });
        if (!limit.allowed) return NextResponse.json({ error: "请求过于频繁，请稍后重试", retryAfter: Math.ceil((limit.resetAt - Date.now()) / 1000) }, { status: 429 });
        await resetPasswordByEmail({
            email: typeof body.email === "string" ? body.email : "",
            code: typeof body.code === "string" ? body.code : "",
            newPassword: typeof body.newPassword === "string" ? body.newPassword : "",
        });
        return NextResponse.json({ ok: true });
    } catch (error) {
        if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Password reset failed", error);
        return NextResponse.json({ error: "重置密码失败" }, { status: 500 });
    }
}
