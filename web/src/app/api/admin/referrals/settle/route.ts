import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { commerceError, commerceOk } from "@/app/api/billing/commerce-response";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { settleDueReferralRewards } from "@/lib/server/referral-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const admin = await getCurrentUser();
    if (!admin) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(admin, "commerce.manage")) return NextResponse.json({ code: 403, data: null, msg: "需要管理员权限" }, { status: 403 });
    try {
        const result = await settleDueReferralRewards({ limit: 100 });
        await safeRecordAuditLog({ action: "admin.referrals.rewards.settle", actor: auditActorFromRequest(request, admin), target: { type: "referral_rewards" }, metadata: result });
        return commerceOk(result);
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.referrals.rewards.settle", status: "failure", actor: auditActorFromRequest(request, admin), target: { type: "referral_rewards" }, metadata: { error: error instanceof Error ? error.message : "unknown" } });
        return commerceError(error, "结算邀请奖励失败", "Settle referral rewards failed");
    }
}
