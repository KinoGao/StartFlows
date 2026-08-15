import { NextResponse } from "next/server";

import { isAuthorizedMaintenanceRequest, isMaintenanceTokenConfigured } from "@/lib/server/maintenance-auth";
import { settleDueReferralRewards } from "@/lib/server/referral-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    if (!isMaintenanceTokenConfigured()) return NextResponse.json({ code: 503, data: null, msg: "维护任务令牌未配置" }, { status: 503 });
    if (!isAuthorizedMaintenanceRequest(request)) return NextResponse.json({ code: 401, data: null, msg: "维护任务认证失败" }, { status: 401 });
    try {
        const result = await settleDueReferralRewards({ limit: 100 });
        return NextResponse.json({ code: 0, data: result, msg: result.processed ? `已处理 ${result.processed} 组到期邀请奖励` : "没有到期邀请奖励" });
    } catch (error) {
        console.error("Settle referral rewards failed", error);
        return NextResponse.json({ code: 500, data: null, msg: "结算邀请奖励失败" }, { status: 500 });
    }
}
