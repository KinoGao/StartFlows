import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { commerceError, commerceOk } from "@/app/api/billing/commerce-response";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { getAdminReferralOverview, saveReferralProgram, type ReferralProgramInput } from "@/lib/server/referral-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const admin = await getCurrentUser();
    if (!admin) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(admin, "commerce.manage")) return NextResponse.json({ code: 403, data: null, msg: "需要管理员权限" }, { status: 403 });
    try {
        return commerceOk(await getAdminReferralOverview());
    } catch (error) {
        return commerceError(error, "加载邀请奖励设置失败", "Load admin referrals failed");
    }
}

export async function PATCH(request: Request) {
    const admin = await getCurrentUser();
    if (!admin) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(admin, "commerce.manage")) return NextResponse.json({ code: 403, data: null, msg: "需要管理员权限" }, { status: 403 });
    try {
        const body = await readJsonBody<ReferralProgramInput>(request);
        const program = await saveReferralProgram(body, admin.id);
        await safeRecordAuditLog({
            action: "admin.referrals.program.update",
            actor: auditActorFromRequest(request, admin),
            target: { type: "referral_program", id: "default" },
            metadata: { enabled: program.enabled, inviteeRewardType: program.inviteeRewardType },
        });
        return commerceOk({ program });
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.referrals.program.update",
            status: "failure",
            actor: auditActorFromRequest(request, admin),
            target: { type: "referral_program", id: "default" },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        return commerceError(error, "保存邀请奖励设置失败", "Save referral program failed");
    }
}
