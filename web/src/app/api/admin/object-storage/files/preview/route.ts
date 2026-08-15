import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { createExternalStorageImagePreviewUrl } from "@/lib/server/object-storage-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "system.manage")) return NextResponse.json({ code: 403, data: null, msg: "需要管理员权限" }, { status: 403 });
    const params = new URL(request.url).searchParams;
    try {
        const url = await createExternalStorageImagePreviewUrl(params.get("key") || "", params.get("width"));
        if (!url) return NextResponse.json({ code: 404, data: null, msg: "图片不存在" }, { status: 404 });
        const response = NextResponse.redirect(url, 307);
        response.headers.set("Cache-Control", "private, no-store");
        response.headers.set("Cross-Origin-Resource-Policy", "same-site");
        response.headers.set("X-Content-Type-Options", "nosniff");
        response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
        return response;
    } catch (error) {
        console.error("Object storage image preview failed", error);
        return NextResponse.json({ code: 500, data: null, msg: "外部存储图片预览失败" }, { status: 500 });
    }
}
