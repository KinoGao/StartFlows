import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { deleteCouponTemplate, saveCouponTemplate, type CouponTemplateInput } from "@/lib/server/coupon-service";
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
        const template = await saveCouponTemplate({ ...(await readJsonBody<CouponTemplateInput>(request)), id, createdByUserId: user.id });
        if (!template) throw new Error("Coupon template was not persisted");
        await safeRecordAuditLog({
            action: "admin.billing.coupon-template.save",
            actor: auditActorFromRequest(request, user),
            target: { type: "coupon_template", id: template.id, label: template.name },
            metadata: { enabled: template.enabled, claimable: template.claimable },
        });
        return commerceOk({ template });
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.billing.coupon-template.save",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "coupon_template", id },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        return commerceError(error, "更新优惠券模板失败", "Admin update coupon template failed");
    }
}

export async function DELETE(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "commerce.manage")) return NextResponse.json({ code: 403, data: null, msg: "需要管理员权限" }, { status: 403 });
    const { id } = await context.params;
    try {
        const template = await deleteCouponTemplate(id);
        await safeRecordAuditLog({ action: "admin.billing.coupon-template.delete", actor: auditActorFromRequest(request, user), target: { type: "coupon_template", id: template.id, label: template.name } });
        return commerceOk({ template });
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.billing.coupon-template.delete",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "coupon_template", id },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        return commerceError(error, "删除优惠券模板失败", "Admin delete coupon template failed");
    }
}
