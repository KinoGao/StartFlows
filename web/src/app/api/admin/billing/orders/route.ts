import { hasAdminPermission } from "@/lib/admin-permissions";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { isBillingInputError, listAdminBillingOrders } from "@/lib/server/billing-service";
import type { BillingOrderStatus } from "@/lib/server/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "billing.read")) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

    try {
        const params = request.nextUrl.searchParams;
        const result = await listAdminBillingOrders({
            page: Number(params.get("page")) || 1,
            pageSize: Number(params.get("pageSize")) || 20,
            status: parseOrderStatus(params.get("status")),
            userId: params.get("userId") || undefined,
            productId: params.get("productId") || undefined,
            keyword: params.get("keyword") || undefined,
        });
        return NextResponse.json({ orders: result.items, total: result.total, page: result.page, pageSize: result.pageSize });
    } catch (error) {
        if (isBillingInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Admin list billing orders failed", error);
        return NextResponse.json({ error: "获取订单失败" }, { status: 500 });
    }
}

function parseOrderStatus(value: string | null): BillingOrderStatus | undefined {
    return value === "pending" || value === "paid" || value === "closed" || value === "canceled" || value === "refunding" || value === "refunded" ? value : undefined;
}
