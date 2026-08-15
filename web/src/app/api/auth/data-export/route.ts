import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { checkRateLimit, rateLimitHeaders } from "@/lib/server/security";
import { createUserDataExportStream } from "@/lib/server/user-data-export-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const limit = await checkRateLimit(`personal-data-export:${currentUser.id}`, { maxRequests: 3, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return NextResponse.json({ error: "导出请求过于频繁，请稍后再试" }, { status: 429, headers: rateLimitHeaders(limit) });

    try {
        const exportedAt = new Date();
        const fileName = `vozeb-pro-personal-data-${exportedAt.toISOString().slice(0, 10)}.json`;
        const stream = await createUserDataExportStream(currentUser.id);
        return new NextResponse(stream, {
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch (error) {
        console.error("personal data export failed", error);
        return NextResponse.json({ error: "个人数据导出失败，请稍后重试" }, { status: 500 });
    }
}
