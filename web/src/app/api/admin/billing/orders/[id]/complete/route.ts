import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { isAuthInputError } from "@/lib/auth/store";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { completeBillingOrderPayment, isBillingInputError } from "@/lib/server/billing-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
    params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "billing.manage")) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

    try {
        const { id } = await context.params;
        const body = await readJsonBody<{
            provider?: unknown;
            channel?: unknown;
            providerTradeId?: unknown;
            providerPaymentId?: unknown;
            paidAt?: unknown;
        }>(request);
        const result = await completeBillingOrderPayment({
            orderId: id,
            provider: body.provider,
            channel: body.channel,
            providerTradeId: body.providerTradeId,
            providerPaymentId: body.providerPaymentId,
            rawPayload: {
                provider: body.provider,
                channel: body.channel,
                providerTradeId: body.providerTradeId,
                providerPaymentId: body.providerPaymentId,
                paidAt: body.paidAt,
            },
            paidAt: body.paidAt,
        });
        await safeRecordAuditLog({
            action: "admin.billing.order.complete",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "billing_order", id: result.order.id, label: result.order.orderNo },
            metadata: {
                userId: result.order.userId,
                planId: result.order.planId,
                pointsGranted: result.pointsGranted,
                amountCents: result.order.amountCents,
                currency: result.order.currency,
            },
        });
        return NextResponse.json(result);
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.billing.order.complete",
            status: "failure",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "billing_order" },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        if (isAuthInputError(error) || isBillingInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Admin complete billing order failed", error);
        return NextResponse.json({ error: "确认支付失败" }, { status: 500 });
    }
}
