import { NextRequest, NextResponse } from "next/server";

import { createCdkCodes, deleteCdkCodes, isAuthInputError, listCdkCodes, type CdkListFilter } from "@/lib/auth/store";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { hasAdminPermission } from "@/lib/admin-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "billing.read")) return NextResponse.json({ error: "当前管理员没有查看财务数据的职责权限" }, { status: 403 });

    const page = Number(request.nextUrl.searchParams.get("page") || 1);
    const pageSize = Number(request.nextUrl.searchParams.get("pageSize") || 20);
    const keyword = request.nextUrl.searchParams.get("keyword") || "";
    const filter = (request.nextUrl.searchParams.get("filter") || "all") as CdkListFilter;
    return NextResponse.json(await listCdkCodes({ page, pageSize, keyword, filter }));
}

export async function POST(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "billing.manage")) return NextResponse.json({ error: "当前管理员没有管理财务数据的职责权限" }, { status: 403 });

    try {
        const body = await readJsonBody<{ count?: number; points?: number; maxRedemptions?: number; expiresAt?: string; expiresInDays?: number; note?: string }>(request);
        const codes = await createCdkCodes(body);
        await safeRecordAuditLog({
            action: "admin.cdk.create",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "cdk" },
            metadata: { count: codes.length, points: body.points, maxRedemptions: body.maxRedemptions, expiresInDays: body.expiresInDays },
        });
        return NextResponse.json({ codes });
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.cdk.create",
            status: "failure",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "cdk" },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        console.error("Create CDK failed", error);
        return NextResponse.json({ error: "生成 CDK 失败" }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "billing.manage")) return NextResponse.json({ error: "当前管理员没有管理财务数据的职责权限" }, { status: 403 });

    try {
        const body = await readJsonBody<{ ids?: string[] }>(request);
        const ids = Array.isArray(body.ids) ? body.ids : [];
        const result = await deleteCdkCodes(ids);
        await safeRecordAuditLog({
            action: "admin.cdk.bulk_delete",
            actor: auditActorFromRequest(request, currentUser),
            target: { type: "cdk" },
            metadata: { requested: ids.length, deleted: result.deleted },
        });
        return NextResponse.json(result);
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.cdk.bulk_delete",
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
