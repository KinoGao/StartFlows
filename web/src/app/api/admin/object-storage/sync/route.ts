import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { migrateLocalMediaToObjectStorage } from "@/lib/server/object-storage-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "system.manage")) return NextResponse.json({ code: 403, data: null, msg: "需要管理员权限" }, { status: 403 });
    const parsed = await readJsonBodyResult<{ limit?: unknown }>(request);
    if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });
    const body = parsed.data;
    try {
        const data = await migrateLocalMediaToObjectStorage(Number(body.limit) || 20);
        await safeRecordAuditLog({
            action: "admin.object-storage.migrate",
            actor: auditActorFromRequest(request, user),
            target: { type: "object_storage", id: "primary" },
            metadata: { migrated: data.migrated, skipped: data.skipped, failed: data.failed, remaining: data.remaining },
        });
        return NextResponse.json({ code: 0, data, msg: data.remaining ? "本批迁移完成，可继续迁移剩余文件" : "本地媒体迁移完成" });
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.object-storage.migrate",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "object_storage", id: "primary" },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        console.error("Local media migration failed", error);
        return NextResponse.json({ code: 500, data: null, msg: error instanceof Error ? error.message : "本地媒体迁移失败" }, { status: 500 });
    }
}
