import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getAdminGenerationOverviewSummary } from "@/lib/server/generation-overview-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "analytics.read")) return NextResponse.json({ code: 403, data: null, msg: "需要管理员权限" }, { status: 403 });

    try {
        return NextResponse.json({ code: 0, data: await getAdminGenerationOverviewSummary(), msg: "OK" });
    } catch (error) {
        console.error("Admin generation overview failed", error);
        return NextResponse.json({ code: 500, data: null, msg: "获取生成运营摘要失败" }, { status: 500 });
    }
}
