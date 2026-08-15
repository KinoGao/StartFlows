import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { createAnnouncement, isAuthInputError, listAnnouncementsPage, type PublicAnnouncement } from "@/lib/auth/store";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "content.manage")) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

    const params = new URL(request.url).searchParams;
    const page = await listAnnouncementsPage(true, {
        page: positiveInteger(params.get("page"), 1),
        pageSize: positiveInteger(params.get("pageSize"), 12),
    });
    return NextResponse.json({ announcements: page.items, total: page.total, page: page.page, pageSize: page.pageSize });
}

export async function POST(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "content.manage")) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

    try {
        const body = await readJsonBody<Partial<PublicAnnouncement>>(request);
        const announcement = await createAnnouncement(body);
        return NextResponse.json({ announcement });
    } catch (error) {
        if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Create announcement failed", error);
        return NextResponse.json({ error: "创建公告失败" }, { status: 500 });
    }
}

function positiveInteger(value: string | null, fallback: number) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}
