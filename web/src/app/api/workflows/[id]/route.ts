import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { hasAnyAdminPermission } from "@/lib/admin-permissions";
import { deleteComfyWorkflow } from "@/lib/server/comfyui-workflow-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAnyAdminPermission(currentUser)) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

    const { id } = await params;
    const deleted = await deleteComfyWorkflow(id);
    if (!deleted) return NextResponse.json({ code: 1, msg: "工作流不存在" }, { status: 404 });
    return NextResponse.json({ code: 0, data: null });
}
