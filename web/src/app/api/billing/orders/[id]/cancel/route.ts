import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { cancelBillingOrderForUser, isBillingInputError } from "@/lib/server/billing-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    try {
        const { id } = await params;
        const order = await cancelBillingOrderForUser(user.id, id);
        await safeRecordAuditLog({
            action: "billing.order.cancel",
            actor: auditActorFromRequest(request, user),
            target: { type: "billing_order", id: order.id, label: order.orderNo },
        });
        return NextResponse.json({ order });
    } catch (error) {
        if (isBillingInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Cancel billing order failed", error);
        return NextResponse.json({ error: "取消订单失败" }, { status: 500 });
    }
}
