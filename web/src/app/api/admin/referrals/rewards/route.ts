import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { commerceError, commerceOk } from "@/app/api/billing/commerce-response";
import { listAdminReferralRewards } from "@/lib/server/referral-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const admin = await getCurrentUser();
    if (!admin) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(admin, "commerce.manage")) return NextResponse.json({ code: 403, data: null, msg: "需要管理员权限" }, { status: 403 });
    try {
        const query = new URL(request.url).searchParams;
        return commerceOk(await listAdminReferralRewards({ page: query.get("page"), pageSize: query.get("pageSize"), status: query.get("status") }));
    } catch (error) {
        return commerceError(error, "加载邀请奖励记录失败", "List referral rewards failed");
    }
}
