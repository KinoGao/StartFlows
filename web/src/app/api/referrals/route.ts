import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { commerceError, commerceOk } from "@/app/api/billing/commerce-response";
import { getReferralCenter } from "@/lib/server/referral-service";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const params = new URL(request.url).searchParams;
        return commerceOk(
            await getReferralCenter(user.id, resolvePublicRequestOrigin(request), {
                referralsPage: params.get("referralsPage"),
                rewardsPage: params.get("rewardsPage"),
                pageSize: params.get("pageSize"),
            }),
        );
    } catch (error) {
        return commerceError(error, "加载邀请中心失败", "Load referral center failed");
    }
}
