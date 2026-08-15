import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { isBillingInputError, listBillingProducts, upsertBillingProduct } from "@/lib/server/billing-service";
import type { BillingProductInput } from "@/lib/server/billing-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "commerce.manage")) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

    try {
        return NextResponse.json({ products: await listBillingProducts(true) });
    } catch (error) {
        if (isBillingInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Admin list billing products failed", error);
        return NextResponse.json({ error: "获取套餐商品失败" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "commerce.manage")) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

    try {
        const product = await upsertBillingProduct(await readJsonBody<BillingProductInput>(request));
        await safeRecordAuditLog({
            action: "admin.billing.product.upsert",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "billing_product", id: product.id, label: product.name },
            metadata: { planId: product.planId, amountCents: product.amountCents, currency: product.currency, enabled: product.enabled },
        });
        return NextResponse.json({ product });
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.billing.product.upsert",
            status: "failure",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "billing_product" },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        if (isBillingInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Admin upsert billing product failed", error);
        return NextResponse.json({ error: "保存套餐商品失败" }, { status: 500 });
    }
}
