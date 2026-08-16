import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { hasAnyAdminPermission } from "@/lib/admin-permissions";
import { readJsonBody } from "@/lib/auth/request";
import { createComfyWorkflow } from "@/lib/server/comfyui-workflow-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 管理员上传 ComfyUI 工作流（对齐旧后端 /api/workflows/upload） */
export async function POST(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAnyAdminPermission(currentUser)) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

    const body = await readJsonBody<{ name?: unknown; workflow?: unknown }>(request, 16 * 1024 * 1024).catch(() => ({}) as { name?: unknown; workflow?: unknown });
    if (typeof body.name !== "string" || !body.name.trim()) return NextResponse.json({ code: 1, msg: "缺少工作流名称" }, { status: 400 });
    if (!body.workflow || typeof body.workflow !== "object" || Array.isArray(body.workflow)) return NextResponse.json({ code: 1, msg: "工作流 JSON 无效" }, { status: 400 });
    const created = await createComfyWorkflow(body.name, body.workflow as Record<string, unknown>);
    return NextResponse.json({ code: 0, data: created });
}
