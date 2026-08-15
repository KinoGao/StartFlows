import { hasAdminPermission } from "@/lib/admin-permissions";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getAdminBillingSummary, isBillingInputError } from "@/lib/server/billing-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "billing.read")) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

    try {
        const params = request.nextUrl.searchParams;
        return NextResponse.json({
            summary: await getAdminBillingSummary({
                startDate: params.get("startDate") || undefined,
                endDate: params.get("endDate") || undefined,
            }),
        });
    } catch (error) {
        if (isBillingInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Admin billing summary failed", error);
        return NextResponse.json({ error: "获取财务钱包摘要失败" }, { status: 500 });
    }
}
