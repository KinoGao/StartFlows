import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { GenerationTaskReviewError, reviewGenerationTask, type GenerationTaskReviewInput, type ReviewableGenerationTaskType } from "@/lib/server/generation-task-review-service";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";

export async function POST(request: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "generation.manage")) return NextResponse.json({ code: 403, data: null, msg: "需要管理员权限" }, { status: 403 });
    const { type, id } = await params;
    if (!isReviewableType(type)) return NextResponse.json({ code: 400, data: null, msg: "任务类型不支持人工确认" }, { status: 400 });
    const parsed = await readJsonBodyResult<Omit<GenerationTaskReviewInput, "origin"> | null>(request);
    if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });
    const body = parsed.data;
    if (!body || (body.action !== "resume_upstream" && body.action !== "provide_result" && body.action !== "confirm_failed")) return NextResponse.json({ code: 400, data: null, msg: "人工确认操作无效" }, { status: 400 });
    try {
        const input = body.action === "resume_upstream" ? { ...body, origin: resolveInternalOrigin(new URL(request.url).origin) } : body;
        const data = await reviewGenerationTask(type, id, input as GenerationTaskReviewInput);
        return NextResponse.json({ code: 0, data, msg: "任务接管状态已更新" });
    } catch (error) {
        if (error instanceof GenerationTaskReviewError) return NextResponse.json({ code: error.status, data: null, msg: error.message }, { status: error.status });
        console.error("Generation task review failed", { type, id, error: error instanceof Error ? error.message : "unknown" });
        return NextResponse.json({ code: 500, data: null, msg: "任务接管失败" }, { status: 500 });
    }
}

function isReviewableType(value: string): value is ReviewableGenerationTaskType {
    return value === "text" || value === "image" || value === "video" || value === "audio";
}
