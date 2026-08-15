import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { deletePromotionCampaign, savePromotionCampaign, type PromotionCampaignInput } from "@/lib/server/promotion-service";
import { commerceError, commerceOk } from "@/app/api/billing/commerce-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "commerce.manage")) return NextResponse.json({ code: 403, data: null, msg: "需要管理员权限" }, { status: 403 });
    const { id } = await context.params;
    try {
        const campaign = await savePromotionCampaign({ ...(await readJsonBody<PromotionCampaignInput>(request)), id, createdByUserId: user.id });
        if (!campaign) throw new Error("Promotion was not persisted");
        await safeRecordAuditLog({
            action: "admin.billing.promotion.save",
            actor: auditActorFromRequest(request, user),
            target: { type: "promotion_campaign", id: campaign.id, label: campaign.name },
            metadata: { enabled: campaign.enabled, productCount: campaign.products.length },
        });
        return commerceOk({ campaign });
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.billing.promotion.save",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "promotion_campaign", id },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        return commerceError(error, "更新促销活动失败", "Admin update promotion failed");
    }
}

export async function DELETE(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "commerce.manage")) return NextResponse.json({ code: 403, data: null, msg: "需要管理员权限" }, { status: 403 });
    const { id } = await context.params;
    try {
        const campaign = await deletePromotionCampaign(id);
        await safeRecordAuditLog({ action: "admin.billing.promotion.delete", actor: auditActorFromRequest(request, user), target: { type: "promotion_campaign", id: campaign.id, label: campaign.name } });
        return commerceOk({ campaign });
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.billing.promotion.delete",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "promotion_campaign", id },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        return commerceError(error, "删除促销活动失败", "Admin delete promotion failed");
    }
}
