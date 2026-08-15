import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { listUserLoginEvents } from "@/lib/server/audit-log-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const params = new URL(request.url).searchParams;
    const result = await listUserLoginEvents(currentUser.id, {
        page: Number(params.get("page") || 1),
        pageSize: Number(params.get("pageSize") || 20),
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
