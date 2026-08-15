import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { issueCoupon } from "@/lib/server/coupon-service";
import { commerceError, commerceOk } from "../../commerce-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const body = await readJsonBody<{ templateId?: unknown; code?: unknown }>(request);
        const coupon = await issueCoupon({ ...body, userId: user.id, source: "claim" });
        await safeRecordAuditLog({
            action: "billing.coupon.claim",
            actor: auditActorFromRequest(request, user),
            target: { type: "user_coupon", id: coupon.id },
            metadata: { templateId: coupon.templateId },
        });
        return commerceOk({ coupon }, 201);
    } catch (error) {
        await safeRecordAuditLog({
            action: "billing.coupon.claim",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "user_coupon" },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        return commerceError(error, "领取优惠券失败", "Claim coupon failed");
    }
}
