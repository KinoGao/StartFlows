import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { createEmailVerificationCode, getAuthSettings, isAuthInputError, type EmailCodePurpose } from "@/lib/auth/store";
import { sendSmtpMail } from "@/lib/mail/smtp";
import { checkAuthRateLimit } from "@/lib/server/security";

export const runtime = "nodejs";

const purposeText: Record<EmailCodePurpose, string> = {
    register: "注册账号",
    "email-change": "修改邮箱",
    "password-reset": "重置密码",
};

export async function POST(request: Request) {
    try {
        const body = await readJsonBody<{ purpose?: unknown; email?: unknown }>(request);
        const purpose = body.purpose === "email-change" || body.purpose === "password-reset" ? body.purpose : body.purpose === "register" ? body.purpose : null;
        if (!purpose) return NextResponse.json({ error: "验证码用途不正确" }, { status: 400 });
        const emailKey = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
        const limit = await checkAuthRateLimit(`email-code:${purpose}`, request, emailKey, { maxRequests: 5, windowMs: 60 * 60 * 1000 });
        if (!limit.allowed) return NextResponse.json({ error: "验证码发送过于频繁，请稍后重试", retryAfter: Math.ceil((limit.resetAt - Date.now()) / 1000) }, { status: 429 });

        const currentUser = await getCurrentUser();
        if (purpose === "email-change" && !currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });

        const issued = await createEmailVerificationCode({
            purpose,
            email: typeof body.email === "string" ? body.email : "",
            userId: purpose === "email-change" ? currentUser?.id : undefined,
        });
        if (issued.deliverEmail) {
            const settings = await getAuthSettings();
            const siteTitle = settings.site.title;
            await sendSmtpMail({
                mail: settings.mail,
                to: issued.email,
                subject: `${siteTitle} ${purposeText[purpose]}验证码`,
                text: [`你的 ${siteTitle} ${purposeText[purpose]}验证码是：${issued.code}`, "", "验证码 10 分钟内有效，请勿转发给他人。"].join("\r\n"),
            });
        }
        return NextResponse.json({ ok: true });
    } catch (error) {
        if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Send email code failed", error);
        return NextResponse.json({ error: "发送验证码失败，请稍后重试" }, { status: 400 });
    }
}
