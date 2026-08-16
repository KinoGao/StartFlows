import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { hasAnyAdminPermission } from "@/lib/admin-permissions";
import { readJsonBody } from "@/lib/auth/request";
import { updateComfyWorkflowConfig } from "@/lib/server/comfyui-workflow-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 管理员配置工作流表单字段 / 能力（对齐旧后端 /api/workflows/{id}/config） */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAnyAdminPermission(currentUser)) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

    const { id } = await params;
    const body = await readJsonBody<{ title?: unknown; fields?: unknown; capability?: unknown }>(request).catch(() => ({}) as { title?: unknown; fields?: unknown; capability?: unknown });
    const updated = await updateComfyWorkflowConfig(id, {
        title: typeof body.title === "string" ? body.title : undefined,
        fields: Array.isArray(body.fields) ? body.fields : undefined,
        capability: typeof body.capability === "string" ? body.capability : undefined,
    });
    if (!updated) return NextResponse.json({ code: 1, msg: "工作流不存在" }, { status: 404 });
    return NextResponse.json({ code: 0, data: updated });
}
