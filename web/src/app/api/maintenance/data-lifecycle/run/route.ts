import { NextResponse } from "next/server";

import { runDataLifecycleMaintenance } from "@/lib/server/data-lifecycle-service";
import { isAuthorizedMaintenanceRequest, isMaintenanceTokenConfigured } from "@/lib/server/maintenance-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    if (!isMaintenanceTokenConfigured()) return NextResponse.json({ code: 503, data: null, msg: "维护任务令牌未配置" }, { status: 503 });
    if (!isAuthorizedMaintenanceRequest(request)) return NextResponse.json({ code: 401, data: null, msg: "维护任务认证失败" }, { status: 401 });

    try {
        const data = await runDataLifecycleMaintenance();
        return NextResponse.json({ code: 0, data, msg: "到期技术数据维护完成" });
    } catch (error) {
        console.error("Data lifecycle maintenance failed", error);
        return NextResponse.json({ code: 500, data: null, msg: "到期技术数据维护失败" }, { status: 500 });
    }
}
