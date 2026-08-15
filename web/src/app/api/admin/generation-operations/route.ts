import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { listAdminGenerationOperations } from "@/lib/server/generation-operations-service";

export async function GET(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "generation.read")) return NextResponse.json({ code: 403, data: null, msg: "需要管理员权限" }, { status: 403 });
    const params = new URL(request.url).searchParams;
    const data = await listAdminGenerationOperations({
        page: Number(params.get("page") || 1),
        pageSize: Number(params.get("pageSize") || 20),
        type: params.get("type") || undefined,
        status: params.get("status") || undefined,
        surface: params.get("surface") || undefined,
        userId: params.get("userId") || undefined,
        search: params.get("search") || undefined,
    });
    return NextResponse.json({ code: 0, data, msg: "OK" });
}
