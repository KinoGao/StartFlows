import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getAudioTask, transitionAudioTask } from "@/lib/server/audio-task-store";
import { refundAudioTask } from "@/lib/server/audio-task-refund";
import { pointsResponseHeaders } from "@/lib/server/points-response";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { generationModelId } from "@/lib/server/generation-channel";
import { runGenerationTaskRecoveryBatch } from "@/lib/server/generation-task-recovery-service";
import { cancellationExecutionPatch, type GenerationCancellationTarget } from "@/lib/server/generation-task-cancellation-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const task = await getAudioTask((await params).id);
    if (!task || (task.userId !== user.id && user.role !== "admin")) return NextResponse.json({ error: "任务不存在或已过期" }, { status: 404 });
    if (((task.status === "pending" || task.status === "running") && task.executionPhase !== "needs_review") || (task.status === "cancelled" && (task.executionPhase === "cancel_requested" || task.executionPhase === "cancel_polling"))) {
        const origin = resolveInternalOrigin(new URL(request.url).origin);
        after(() => runGenerationTaskRecoveryBatch({ origin, cookie: request.headers.get("cookie") || "", limit: 1, taskIds: [task.id] }));
    }
    const shouldRefund = Boolean(task.billing?.pointsRecordId && !task.billing.refunded && task.status === "error");
    const settledTask = shouldRefund ? await refundAudioTask(task) : task;
    const refreshedUser = shouldRefund ? await getCurrentUser(request) : user;
    return NextResponse.json({ task: { ...publicTask(settledTask), needsReview: task.executionPhase === "needs_review", reviewReason: task.reviewReason, executionPhase: task.executionPhase } }, { headers: pointsResponseHeaders(refreshedUser) });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser(request);
    const task = user ? await getAudioTask((await params).id) : null;
    if (!user || !task || (task.userId !== user.id && user.role !== "admin")) return NextResponse.json({ error: "任务不存在或已过期" }, { status: user ? 404 : 401 });
    const parsed = await readJsonBodyResult<{ status?: string }>(request);
    if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: parsed.status });
    const body = parsed.data;
    if (body.status !== "cancelled" || !["pending", "running"].includes(task.status)) return NextResponse.json({ error: "当前任务无法取消" }, { status: 409 });
    const target: GenerationCancellationTarget = {
        type: "audio",
        taskId: task.id,
        userId: task.userId,
        executionPhase: task.executionPhase,
        upstreamTaskId: task.upstream?.id,
        queryPath: task.config.advancedConfig?.queryPath,
        config: task.config,
    };
    const next = await transitionAudioTask(task, ["pending", "running"], { status: "cancelled", error: "任务已取消", billing: task.billing }, cancellationExecutionPatch(target));
    if (!next) return NextResponse.json({ error: "当前任务无法取消" }, { status: 409 });
    const origin = resolveInternalOrigin(new URL(request.url).origin);
    after(() => runGenerationTaskRecoveryBatch({ origin, limit: 1, taskIds: [task.id] }));
    const refreshedUser = await getCurrentUser(request);
    return NextResponse.json({ task: publicTask(next) }, { headers: pointsResponseHeaders(refreshedUser) });
}

function publicTask(task: NonNullable<Awaited<ReturnType<typeof getAudioTask>>>) {
    return {
        id: task.id,
        status: task.status,
        model: generationModelId(task.config),
        result: task.result,
        error: task.error,
        billing: task.billing ? { pointsCost: task.billing.pointsCost, refunded: task.billing.refunded } : undefined,
    };
}
