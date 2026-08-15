import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { deleteCdkCode, isAuthInputError, updateCdkCode, type PublicCdkCode } from "@/lib/auth/store";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
    params: Promise<{ id: string }>;
};

async function requireAdmin() {
    const currentUser = await getCurrentUser();
    if (!currentUser) return { response: NextResponse.json({ error: "请先登录" }, { status: 401 }) };
    if (!hasAdminPermission(currentUser, "billing.manage")) return { response: NextResponse.json({ error: "需要管理员权限" }, { status: 403 }) };
    return { currentUser };
}

export async function PATCH(request: Request, context: RouteContext) {
    const guard = await requireAdmin();
    if (guard.response) return guard.response;
    const currentUser = guard.currentUser;

    try {
        const { id } = await context.params;
        const body = await readJsonBody<Partial<PublicCdkCode>>(request);
        const code = await updateCdkCode(id, body);
        await safeRecordAuditLog({
            action: "admin.cdk.update",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "cdk", id: code.id, label: code.codePreview },
            metadata: { fields: Object.keys(body), status: code.status, points: code.points, maxRedemptions: code.maxRedemptions },
        });
        return NextResponse.json({ code });
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.cdk.update",
            status: "failure",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "cdk" },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Update CDK failed", error);
        return NextResponse.json({ error: "更新 CDK 失败" }, { status: 500 });
    }
}

export async function DELETE(request: Request, context: RouteContext) {
    const guard = await requireAdmin();
    if (guard.response) return guard.response;
    const currentUser = guard.currentUser;

    try {
        const { id } = await context.params;
        const result = await deleteCdkCode(id);
        await safeRecordAuditLog({
            action: "admin.cdk.delete",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "cdk", id },
            metadata: { deleted: result.deleted },
        });
        return NextResponse.json(result);
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.cdk.delete",
            status: "failure",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "cdk" },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Delete CDK failed", error);
        return NextResponse.json({ error: "删除 CDK 失败" }, { status: 500 });
    }
}
