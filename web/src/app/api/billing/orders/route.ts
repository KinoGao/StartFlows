import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { createBillingOrder, isBillingInputError, listUserBillingOrders } from "@/lib/server/billing-service";
import type { BillingOrderStatus } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    try {
        const params = request.nextUrl.searchParams;
        const result = await listUserBillingOrders(currentUser.id, {
            page: Number(params.get("page")) || 1,
            pageSize: Number(params.get("pageSize")) || 20,
            status: parseOrderStatus(params.get("status")),
        });
        return NextResponse.json({ orders: result.items, total: result.total, page: result.page, pageSize: result.pageSize });
    } catch (error) {
        if (isBillingInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("List billing orders failed", error);
        return NextResponse.json({ error: "获取订单失败" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    try {
        const body = await readJsonBody<{ productId?: unknown; quantity?: unknown; provider?: unknown; userCouponId?: unknown }>(request);
        const order = await createBillingOrder({ ...body, userId: currentUser.id });
        await safeRecordAuditLog({
            action: "billing.order.create",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "billing_order", id: order.id, label: order.orderNo },
            metadata: { productId: order.productId, amountCents: order.amountCents, currency: order.currency, provider: order.provider, userCouponId: order.userCouponId },
        });
        return NextResponse.json({ order });
    } catch (error) {
        await safeRecordAuditLog({
            action: "billing.order.create",
            status: "failure",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "billing_order" },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        if (isBillingInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Create billing order failed", error);
        return NextResponse.json({ error: "创建订单失败" }, { status: 500 });
    }
}

function parseOrderStatus(value: string | null): BillingOrderStatus | undefined {
    return value === "pending" || value === "paid" || value === "closed" || value === "canceled" || value === "refunding" || value === "refunded" ? value : undefined;
}
