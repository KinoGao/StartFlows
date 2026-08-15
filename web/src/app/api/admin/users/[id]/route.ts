import { NextResponse } from "next/server";

import { isAuthInputError, updateUserByAdmin, type UserRole, type UserStatus } from "@/lib/auth/store";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { deleteAdminUserWithMediaCleanup } from "@/lib/server/admin-user-deletion-service";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { hasAnyAdminPermission, normalizeAdminPermissions } from "@/lib/admin-permissions";

export const runtime = "nodejs";

type RouteContext = {
    params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAnyAdminPermission(currentUser, ["users.manage", "administrators.manage", "billing.manage"])) return NextResponse.json({ error: "当前管理员没有编辑用户的职责权限" }, { status: 403 });

    try {
        const { id } = await context.params;
        const body = await readJsonBody<{ displayName?: unknown; email?: unknown; password?: unknown; role?: unknown; adminPermissions?: unknown; status?: unknown; pointsBalance?: unknown; planId?: unknown }>(request);
        const patch: { displayName?: string; email?: string; password?: string; role?: UserRole; adminPermissions?: ReturnType<typeof normalizeAdminPermissions>; status?: UserStatus; pointsBalance?: number; planId?: string } = {};

        if (typeof body.displayName === "string") patch.displayName = body.displayName;
        if (typeof body.email === "string") patch.email = body.email;
        if (typeof body.password === "string" && body.password) patch.password = body.password;
        if (body.role === "admin" || body.role === "user") patch.role = body.role;
        if (Array.isArray(body.adminPermissions)) patch.adminPermissions = normalizeAdminPermissions(body.adminPermissions);
        if (body.status === "active" || body.status === "disabled") patch.status = body.status;
        if (body.pointsBalance !== undefined) patch.pointsBalance = Number(body.pointsBalance);
        if (typeof body.planId === "string") patch.planId = body.planId;

        const user = await updateUserByAdmin(currentUser.id, id, patch);
        await safeRecordAuditLog({
            action: "admin.user.update",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "user", id: user.id, label: user.username },
            metadata: { fields: Object.keys(patch), role: user.role, adminPermissions: user.adminPermissions, status: user.status, planId: user.planId, pointsBalance: user.pointsBalance },
        });
        return NextResponse.json({ user });
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.user.update",
            status: "failure",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "user" },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Admin user update failed", error);
        return NextResponse.json({ error: "更新用户失败" }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: RouteContext) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAnyAdminPermission(currentUser, ["users.manage", "administrators.manage"])) return NextResponse.json({ error: "当前管理员没有删除用户的职责权限" }, { status: 403 });

    try {
        const { id } = await context.params;
        await deleteAdminUserWithMediaCleanup(currentUser.id, id);
        await safeRecordAuditLog({
            action: "admin.user.delete",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "user", id },
        });
        return NextResponse.json({ ok: true });
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.user.delete",
            status: "failure",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "user" },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Admin user delete failed", error);
        return NextResponse.json({ error: "删除用户失败" }, { status: 500 });
    }
}
