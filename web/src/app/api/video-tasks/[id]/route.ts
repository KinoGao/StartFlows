import { after, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { canReconcileVideoTask, getVideoTask, transitionVideoTask } from "@/lib/server/video-task-store";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { pointsResponseHeaders } from "@/lib/server/points-response";
import { generationModelId } from "@/lib/server/generation-channel";
import { runGenerationTaskRecoveryBatch } from "@/lib/server/generation-task-recovery-service";
import { cancellationExecutionPatch, type GenerationCancellationTarget } from "@/lib/server/generation-task-cancellation-service";
import { refundVideoTask } from "@/lib/server/video-task-refund";
import { getStoredGenerationTaskRecord } from "@/lib/server/generation-task-store";
import { writeVideoGenerationLog } from "@/lib/server/video-task-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser(request);
    const task = user ? await getVideoTask((await params).id) : null;
    if (!user || !task || (task.userId !== user.id && user.role !== "admin")) return NextResponse.json({ error: "视频任务不存在" }, { status: user ? 404 : 401 });
    const schedule = await getStoredGenerationTaskRecord("video", task.id);
    const executionPhase = schedule?.executionPhase || settledExecutionPhase(task.status);
    if (canReconcileVideoTask(task) || (task.status === "cancelled" && (executionPhase === "cancel_requested" || executionPhase === "cancel_polling"))) {
        const origin = resolveInternalOrigin(new URL(request.url).origin);
        const cookie = request.headers.get("cookie") || "";
        after(() => runGenerationTaskRecoveryBatch({ origin, cookie, limit: 1, taskIds: [task!.id] }));
    }
    const shouldRefund = Boolean(task.upstream.pointsRecordId && !task.upstream.refunded && task.status === "error");
    const settledTask = shouldRefund ? await refundVideoTask(task) : task;
    const refreshedUser = shouldRefund ? await getCurrentUser(request) : user;
    return NextResponse.json(
        { task: { ...publicTask(settledTask), needsReview: executionPhase === "needs_review", reviewReason: executionPhase === "needs_review" ? schedule?.resultPayload?.reviewReason || task.reviewReason : undefined, executionPhase } },
        { headers: pointsResponseHeaders(refreshedUser) },
    );
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser(request);
    const id = (await params).id;
    const task = user ? await getVideoTask(id) : null;
    if (!user || !task || (task.userId !== user.id && user.role !== "admin")) return NextResponse.json({ error: "视频任务不存在" }, { status: user ? 404 : 401 });
    const schedule = await getStoredGenerationTaskRecord("video", task.id);
    const executionPhase = schedule?.executionPhase || settledExecutionPhase(task.status);
    const parsed = await readJsonBodyResult<{ action?: string; status?: string; result?: unknown; error?: unknown }>(request);
    if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: parsed.status });
    const body = parsed.data;
    if (body.result !== undefined || body.error !== undefined || (body.status && body.status !== "cancelled")) {
        return NextResponse.json({ error: "视频任务终态和结果只能由服务端更新" }, { status: 403 });
    }
    if (body.action !== "cancel" && body.status !== "cancelled") return NextResponse.json({ error: "不支持的视频任务操作" }, { status: 400 });
    if (task.status !== "running") return NextResponse.json({ error: "当前任务无法取消" }, { status: 409 });
    const target: GenerationCancellationTarget = {
        type: "video",
        taskId: task.id,
        userId: task.userId,
        executionPhase,
        upstreamTaskId: task.upstream.id,
        queryPath: task.config.advancedConfig?.queryPath,
        config: task.config,
    };
    const next = await transitionVideoTask(task, { status: "cancelled", error: "任务已取消", retryable: false }, cancellationExecutionPatch(target));
    if (!next) return NextResponse.json({ error: "当前任务状态无法修改" }, { status: 409 });
    await writeVideoGenerationLog(next, "failed", "任务已取消", false).catch((error) => console.warn("Cancelled video generation log update failed", { taskId: task.id, error }));
    const origin = resolveInternalOrigin(new URL(request.url).origin);
    after(() => runGenerationTaskRecoveryBatch({ origin, limit: 1, taskIds: [task.id] }));
    const refreshedUser = await getCurrentUser();
    return NextResponse.json({ task: publicTask(next) }, { headers: pointsResponseHeaders(refreshedUser) });
}

type VideoTask = NonNullable<Awaited<ReturnType<typeof getVideoTask>>>;

function publicTask(task: VideoTask) {
    return { id: task.id, status: task.status, model: generationModelId(task.config), upstreamId: task.upstream.id, durationSeconds: task.requestedDurationSeconds, result: task.result, error: task.error, canRetry: task.retryable === true };
}

function settledExecutionPhase(status: string) {
    return status === "pending" || status === "running" ? "created" : "completed";
}
