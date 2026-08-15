import { hasAdminPermission } from "@/lib/admin-permissions";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { listAuditLogs } from "@/lib/server/audit-log-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "audit.read")) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

    const params = request.nextUrl.searchParams;
    const result = await listAuditLogs({
        page: Number(params.get("page")) || 1,
        pageSize: Number(params.get("pageSize")) || 20,
        keyword: params.get("keyword") || "",
        action: params.get("action") || "",
        status: params.get("status") || "",
        actorId: params.get("actorId") || "",
        targetType: params.get("targetType") || "",
        start: params.get("start") || "",
        end: params.get("end") || "",
    });

    return NextResponse.json({ logs: result.items, total: result.total, page: result.page, pageSize: result.pageSize });
}
