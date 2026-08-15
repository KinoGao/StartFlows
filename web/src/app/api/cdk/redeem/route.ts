import { NextResponse } from "next/server";

import { isAuthInputError, redeemCdkCode } from "@/lib/auth/store";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser, serializeCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { checkRateLimit, getClientIp } from "@/lib/server/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const limit = await checkRateLimit(`cdk-redeem:${currentUser.id}:${getClientIp(request)}`, { maxRequests: 10, windowMs: 15 * 60 * 1000 });
    if (!limit.allowed) return NextResponse.json({ error: "兑换请求过于频繁，请稍后重试", retryAfter: Math.ceil((limit.resetAt - Date.now()) / 1000) }, { status: 429 });

    try {
        const body = await readJsonBody<{ code?: string }>(request);
        const result = await redeemCdkCode(currentUser.id, body.code || "");
        await safeRecordAuditLog({
            action: "cdk.redeem",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "cdk", id: result.cdk.id, label: result.cdk.codePreview },
            metadata: { points: result.points },
        });
        return NextResponse.json({ ...result, user: serializeCurrentUser(result.user) });
    } catch (error) {
        await safeRecordAuditLog({
            action: "cdk.redeem",
            status: "failure",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "cdk" },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Redeem CDK failed", error);
        return NextResponse.json({ error: "兑换失败" }, { status: 500 });
    }
}
