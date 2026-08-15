import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getAuthSettings } from "@/lib/auth/store";
import { buildAgentReadiness } from "@/lib/server/agent-readiness";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "upstream.manage")) return NextResponse.json({ code: 403, data: null, msg: "需要管理员权限" }, { status: 403 });
    return NextResponse.json({ code: 0, data: buildAgentReadiness(await getAuthSettings()), msg: "OK" });
}
