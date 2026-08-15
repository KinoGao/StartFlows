import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { deleteBillingProduct, isBillingInputError, updateBillingProduct } from "@/lib/server/billing-service";
import type { BillingProductInput } from "@/lib/server/billing-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
    params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "commerce.manage")) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

    try {
        const { id } = await context.params;
        const product = await updateBillingProduct(id, await readJsonBody<BillingProductInput>(request));
        await safeRecordAuditLog({
            action: "admin.billing.product.update",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "billing_product", id: product.id, label: product.name },
            metadata: { planId: product.planId, amountCents: product.amountCents, currency: product.currency, enabled: product.enabled },
        });
        return NextResponse.json({ product });
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.billing.product.update",
            status: "failure",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "billing_product" },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        if (isBillingInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Admin update billing product failed", error);
        return NextResponse.json({ error: "更新套餐商品失败" }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: RouteContext) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "commerce.manage")) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

    try {
        const { id } = await context.params;
        const product = await deleteBillingProduct(id);
        await safeRecordAuditLog({
            action: "admin.billing.product.delete",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "billing_product", id: product.id, label: product.name },
        });
        return NextResponse.json({ product });
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.billing.product.delete",
            status: "failure",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "billing_product" },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        if (isBillingInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Admin disable billing product failed", error);
        return NextResponse.json({ error: "删除套餐商品失败" }, { status: 500 });
    }
}
