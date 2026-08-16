import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { hasAnyAdminPermission } from "@/lib/admin-permissions";
import { getComfyUiConfig, runtimeComfyUiConfig, saveComfyUiConfig, type ComfyUiPlatformConfig } from "@/lib/server/comfyui-config";
import { readJsonBody } from "@/lib/auth/request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 创作端运行时 ComfyUI 配置（不含 baseUrl） */
export async function GET() {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    return NextResponse.json({ comfyui: runtimeComfyUiConfig(await getComfyUiConfig()) });
}

/** 管理员更新 ComfyUI 平台配置 */
export async function PUT(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAnyAdminPermission(currentUser)) return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });

    const body = await readJsonBody<Partial<ComfyUiPlatformConfig>>(request).catch(() => ({}) as Partial<ComfyUiPlatformConfig>);
    const saved = await saveComfyUiConfig({
        enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
        baseUrl: typeof body.baseUrl === "string" ? body.baseUrl : undefined,
        clientId: typeof body.clientId === "string" ? body.clientId : undefined,
        defaultWorkflowId: typeof body.defaultWorkflowId === "string" ? body.defaultWorkflowId : undefined,
        timeoutSeconds: typeof body.timeoutSeconds === "number" ? body.timeoutSeconds : undefined,
        pollIntervalMs: typeof body.pollIntervalMs === "number" ? body.pollIntervalMs : undefined,
    });
    return NextResponse.json({ comfyui: saved });
}
