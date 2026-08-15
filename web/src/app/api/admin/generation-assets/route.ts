import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { findPublicUserIdsByKeyword, getPublicUsersByIds } from "@/lib/auth/store";
import { cleanupExpiredLocalMediaAssets, deleteLocalMediaAssets, getLocalMediaAssetSummary, listLocalMediaAssets } from "@/lib/server/local-media-storage";
import { hasAdminPermission } from "@/lib/admin-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "generation.read")) return NextResponse.json({ error: "当前管理员没有查看生成资产的职责权限" }, { status: 403 });

    const params = new URL(request.url).searchParams;
    if (params.get("summaryOnly") === "1") return NextResponse.json({ code: 0, data: { summary: await getLocalMediaAssetSummary() }, msg: "OK" });
    const search = params.get("search") || undefined;
    const ownerUserIds = search ? await findPublicUserIdsByKeyword(search) : [];
    const data = await listLocalMediaAssets({
        page: Number(params.get("page") || 1),
        pageSize: Number(params.get("pageSize") || 20),
        storageClass: params.get("storageClass") || undefined,
        type: params.get("type") || undefined,
        source: params.get("source") || undefined,
        search,
        ownerUserIds,
    });
    const users = await getPublicUsersByIds(data.items.map((item) => item.ownerUserId || ""));
    const userMap = new Map(users.map((user) => [user.id, user]));
    return NextResponse.json({
        code: 0,
        data: {
            ...data,
            items: data.items.map((item) => {
                const owner = item.ownerUserId ? userMap.get(item.ownerUserId) : undefined;
                return { ...item, ownerAccountId: owner?.accountId, ownerUsername: owner?.username, ownerDisplayName: owner?.displayName };
            }),
        },
        msg: "OK",
    });
}

export async function DELETE(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "generation.manage")) return NextResponse.json({ error: "当前管理员没有管理生成资产的职责权限" }, { status: 403 });

    const parsed = await readJsonBodyResult<{ ids?: unknown; expired?: unknown }>(request);
    if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });
    const body = parsed.data;
    if (body.expired === true) return NextResponse.json({ code: 0, data: await cleanupExpiredLocalMediaAssets(), msg: "过期临时文件已清理" });
    const ids = Array.isArray(body.ids) ? body.ids.filter((id): id is string => typeof id === "string") : [];
    if (!ids.length) return NextResponse.json({ code: 400, data: null, msg: "请选择要删除的媒体文件" }, { status: 400 });
    const result = await deleteLocalMediaAssets(ids);
    return NextResponse.json({ code: 0, data: result, msg: result.blocked.length ? "部分文件仍被业务记录引用，未执行删除" : "媒体文件已删除" });
}
