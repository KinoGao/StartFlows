import { hasAdminPermission } from "@/lib/admin-permissions";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { listCouponTemplates, saveCouponTemplate, type CouponTemplateInput } from "@/lib/server/coupon-service";
import { commerceError, commerceOk } from "@/app/api/billing/commerce-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "commerce.manage")) return NextResponse.json({ code: 403, data: null, msg: "需要管理员权限" }, { status: 403 });
    try {
        const params = request.nextUrl.searchParams;
        const result = await listCouponTemplates({
            page: Number(params.get("page")) || 1,
            pageSize: Number(params.get("pageSize")) || 20,
            includeDisabled: params.get("includeDisabled") !== "false",
            keyword: params.get("keyword") || undefined,
            selectedId: params.get("selectedId") || undefined,
        });
        return commerceOk({ templates: result.items, total: result.total, page: result.page, pageSize: result.pageSize });
    } catch (error) {
        return commerceError(error, "获取优惠券模板失败", "Admin list coupon templates failed");
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "commerce.manage")) return NextResponse.json({ code: 403, data: null, msg: "需要管理员权限" }, { status: 403 });
    try {
        const template = await saveCouponTemplate({ ...(await readJsonBody<CouponTemplateInput>(request)), createdByUserId: user.id });
        if (!template) throw new Error("Coupon template was not persisted");
        await safeRecordAuditLog({
            action: "admin.billing.coupon-template.save",
            actor: auditActorFromRequest(request, user),
            target: { type: "coupon_template", id: template.id, label: template.name },
            metadata: { enabled: template.enabled, claimable: template.claimable },
        });
        return commerceOk({ template }, 201);
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.billing.coupon-template.save",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "coupon_template" },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        return commerceError(error, "保存优惠券模板失败", "Admin save coupon template failed");
    }
}
