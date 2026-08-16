import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { listComfyWorkflows } from "@/lib/server/comfyui-workflow-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 画布 ComfyUI 节点读取已发布工作流列表 */
export async function GET() {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    return NextResponse.json({ code: 0, data: await listComfyWorkflows() });
}
