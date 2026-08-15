import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getPublicUsersByIds, isAuthInputError } from "@/lib/auth/store";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { deleteExternalStorageFiles, listExternalStorageFiles } from "@/lib/server/object-storage-service";
import { hasAdminPermission } from "@/lib/admin-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const denied = await requireAdmin();
    if (denied) return denied;
    try {
        const params = new URL(request.url).searchParams;
        const data = await listExternalStorageFiles({
            prefix: params.get("prefix") || undefined,
            cursor: params.get("cursor") || undefined,
            limit: Number(params.get("limit") || 30),
            type: params.get("type") || undefined,
            source: params.get("source") || undefined,
            ownerUserId: params.get("ownerUserId") || undefined,
        });
        const users = await getPublicUsersByIds(data.items.map((item) => item.ownerUserId || ""));
        const userMap = new Map(users.map((user) => [user.id, user]));
        return NextResponse.json(
            {
                code: 0,
                data: {
                    ...data,
                    items: data.items.map((item) => {
                        const owner = item.ownerUserId ? userMap.get(item.ownerUserId) : undefined;
                        return { ...item, ownerAccountId: owner?.accountId, ownerUsername: owner?.username, ownerDisplayName: owner?.displayName };
                    }),
                },
                msg: "OK",
            },
            { headers: { "Cache-Control": "private, no-store" } },
        );
    } catch (error) {
        console.error("Object storage list failed", error);
        return NextResponse.json({ code: 500, data: null, msg: error instanceof Error ? error.message : "外部存储文件加载失败" }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "system.manage")) return NextResponse.json({ code: 403, data: null, msg: "当前管理员没有管理存储的职责权限" }, { status: 403 });
    const parsed = await readJsonBodyResult<{ keys?: unknown }>(request);
    if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });
    const body = parsed.data;
    const keys = Array.isArray(body.keys) ? body.keys.filter((key): key is string => typeof key === "string") : [];
    if (!keys.length) return NextResponse.json({ code: 400, data: null, msg: "请选择要删除的对象" }, { status: 400 });
    try {
        const data = await deleteExternalStorageFiles(keys);
        await safeRecordAuditLog({
            action: "admin.object-storage.files.delete",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "object_storage", id: "primary" },
            metadata: { requested: keys.length, deleted: data.deleted, blocked: data.blocked.length },
        });
        return NextResponse.json({ code: 0, data, msg: data.blocked.length ? "部分对象仍被业务记录引用，未执行删除" : "外部存储对象已删除" });
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.object-storage.files.delete",
            status: "failure",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "object_storage", id: "primary" },
            metadata: { requested: keys.length, error: error instanceof Error ? error.message : "unknown" },
        });
        if (isAuthInputError(error)) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
        console.error("Object storage delete failed", error);
        return NextResponse.json({ code: 500, data: null, msg: "外部存储对象删除失败" }, { status: 500 });
    }
}

async function requireAdmin() {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    return hasAdminPermission(user, "system.manage") ? null : NextResponse.json({ code: 403, data: null, msg: "当前管理员没有管理存储的职责权限" }, { status: 403 });
}
