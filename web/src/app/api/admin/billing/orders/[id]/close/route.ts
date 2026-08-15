import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { closeBillingOrder, isBillingInputError } from "@/lib/server/billing-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
    params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "billing.manage")) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

    const { id } = await context.params;
    try {
        const body = await readJsonBody<{ reason?: unknown }>(request);
        const result = await closeBillingOrder(id, { ...body, operatorUserId: currentUser.id });
        await safeRecordAuditLog({
            action: "admin.billing.order.close",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "billing_order", id: result.order.id, label: result.order.orderNo },
            metadata: { status: result.order.status, reason: body.reason },
        });
        return NextResponse.json(result);
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.billing.order.close",
            status: "failure",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "billing_order", id },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        if (isBillingInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Admin close billing order failed", error);
        return NextResponse.json({ error: "关闭订单失败" }, { status: 500 });
    }
}
