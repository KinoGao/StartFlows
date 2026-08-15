import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { commerceError, commerceOk } from "@/app/api/billing/commerce-response";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { updateReferralRelationshipRisk } from "@/lib/server/referral-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    const admin = await getCurrentUser();
    if (!admin) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(admin, "commerce.manage")) return NextResponse.json({ code: 403, data: null, msg: "需要管理员权限" }, { status: 403 });
    const { id } = await context.params;
    try {
        const body = await readJsonBody<{ riskStatus?: unknown; reason?: unknown }>(request);
        const relationship = await updateReferralRelationshipRisk({ id, riskStatus: body.riskStatus, reason: body.reason });
        await safeRecordAuditLog({
            action: "admin.referrals.relationship.risk.update",
            actor: auditActorFromRequest(request, admin),
            target: { type: "referral_relationship", id },
            metadata: { riskStatus: relationship?.riskStatus, reason: typeof body.reason === "string" ? body.reason.slice(0, 240) : "" },
        });
        return commerceOk({ relationship });
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.referrals.relationship.risk.update",
            status: "failure",
            actor: auditActorFromRequest(request, admin),
            target: { type: "referral_relationship", id },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        return commerceError(error, "更新邀请关系失败", "Update referral relationship failed");
    }
}
