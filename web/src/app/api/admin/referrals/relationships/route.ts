import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { commerceError, commerceOk } from "@/app/api/billing/commerce-response";
import { listAdminReferralRelationships } from "@/lib/server/referral-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const admin = await getCurrentUser();
    if (!admin) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(admin, "commerce.manage")) return NextResponse.json({ code: 403, data: null, msg: "需要管理员权限" }, { status: 403 });
    try {
        const query = new URL(request.url).searchParams;
        return commerceOk(
            await listAdminReferralRelationships({
                page: query.get("page"),
                pageSize: query.get("pageSize"),
                keyword: query.get("keyword"),
                riskStatus: query.get("riskStatus"),
            }),
        );
    } catch (error) {
        return commerceError(error, "加载邀请关系失败", "List referral relationships failed");
    }
}
