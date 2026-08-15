import { NextRequest, NextResponse } from "next/server";

import { normalizeReferralCode, recordReferralVisit, REFERRAL_COOKIE_NAME } from "@/lib/server/referral-service";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";
import { checkRateLimit, getClientIp } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ code: string }> }) {
    const { code: rawCode } = await context.params;
    const code = normalizeReferralCode(rawCode);
    const countClick = code ? await canCountReferralVisit(request, code) : false;
    const recorded = code ? await recordReferralVisit(code, { countClick }).catch(() => null) : null;
    const target = new URL("/register", resolvePublicRequestOrigin(request));
    const next = safeNextPath(request.nextUrl.searchParams.get("next"));
    if (next) target.searchParams.set("next", next);
    if (recorded) target.searchParams.set("ref", recorded.code);
    else target.searchParams.set("invite", "invalid");
    const response = NextResponse.redirect(target);
    if (recorded) {
        response.cookies.set(REFERRAL_COOKIE_NAME, recorded.code, {
            httpOnly: true,
            sameSite: "lax",
            secure: target.protocol === "https:",
            path: "/",
            maxAge: 30 * 24 * 60 * 60,
        });
    }
    return response;
}

async function canCountReferralVisit(request: NextRequest, code: string) {
    const clientIp = getClientIp(request);
    const [codeLimit, visitorLimit] = await Promise.all([
        checkRateLimit(`referral-visit:code:${code}`, { maxRequests: 300, windowMs: 60 * 60 * 1000 }),
        clientIp === "unknown" ? Promise.resolve({ allowed: true }) : checkRateLimit(`referral-visit:visitor:${code}:${clientIp}`, { maxRequests: 20, windowMs: 60 * 60 * 1000 }),
    ]);
    return codeLimit.allowed && visitorLimit.allowed;
}

function safeNextPath(value: string | null) {
    return value?.startsWith("/") && !value.startsWith("//") ? value : "";
}
