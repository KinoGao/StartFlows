import { after, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { requestPublicOrigin } from "@/app/api/image-tasks/image-task-reference-urls";
import { getImageTask, transitionImageTask } from "@/lib/server/image-task-store";
import { runGenerationTaskRecoveryBatch } from "@/lib/server/generation-task-recovery-service";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { pointsResponseHeaders } from "@/lib/server/points-response";
import { generationModelId } from "@/lib/server/generation-channel";
import { cancellationExecutionPatch, type GenerationCancellationTarget } from "@/lib/server/generation-task-cancellation-service";
import { refundImageTask } from "@/lib/server/image-task-refund";
import { getStoredGenerationTaskRecord } from "@/lib/server/generation-task-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

type RouteContext = {
    params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const { id } = await context.params;
    const task = await getImageTask(id);
    if (!task || (task.userId !== currentUser.id && currentUser.role !== "admin")) return NextResponse.json({ error: "任务不存在或已过期" }, { status: 404 });
    const schedule = await getStoredGenerationTaskRecord("image", task.id);
    const executionPhase = schedule?.executionPhase || settledExecutionPhase(task.status);
    if (isRecoverableImageTask(task, executionPhase)) {
        const origin = resolveInternalOrigin(new URL(request.url).origin);
        after(() => runGenerationTaskRecoveryBatch({ origin, publicOrigin: requestPublicOrigin(request), cookie: request.headers.get("cookie") || "", limit: 1, taskIds: [task.id] }));
    }
    const shouldRefund = Boolean(task.billing?.pointsRecordId && !task.billing.refunded && task.status === "error");
    const settledTask = shouldRefund ? await refundImageTask(task) : task;
    const refreshedUser = shouldRefund ? await getCurrentUser(request) : currentUser;

    return NextResponse.json(
        {
            task: {
                id: settledTask.id,
                kind: settledTask.kind,
                status: settledTask.status,
                model: generationModelId(settledTask.config),
                result: settledTask.result,
                error: settledTask.error,
                canRetry: settledTask.retryable === true,
                needsReview: executionPhase === "needs_review",
                reviewReason: executionPhase === "needs_review" ? task.reviewReason : undefined,
                executionPhase,
            },
        },
        { headers: pointsResponseHeaders(refreshedUser) },
    );
}

function isRecoverableImageTask(task: NonNullable<Awaited<ReturnType<typeof getImageTask>>>, executionPhase: string) {
    return ((task.status === "pending" || task.status === "running") && executionPhase !== "needs_review") || (task.status === "cancelled" && (executionPhase === "cancel_requested" || executionPhase === "cancel_polling"));
}

function settledExecutionPhase(status: string) {
    return status === "pending" || status === "running" ? "created" : "completed";
}

export async function PATCH(request: Request, context: RouteContext) {
    const user = await getCurrentUser(request);
    const task = user ? await getImageTask((await context.params).id) : null;
    if (!user || !task || (task.userId !== user.id && user.role !== "admin")) return NextResponse.json({ error: "任务不存在或已过期" }, { status: user ? 404 : 401 });
    const schedule = await getStoredGenerationTaskRecord("image", task.id);
    const executionPhase = schedule?.executionPhase || settledExecutionPhase(task.status);
    const parsed = await readJsonBodyResult<{ status?: string }>(request);
    if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: parsed.status });
    const body = parsed.data;
    if (body.status !== "cancelled" || !["pending", "running"].includes(task.status)) return NextResponse.json({ error: "当前任务无法取消" }, { status: 409 });
    const target: GenerationCancellationTarget = {
        type: "image",
        taskId: task.id,
        userId: task.userId,
        executionPhase,
        upstreamTaskId: task.upstream?.id,
        queryPath: task.config.advancedConfig?.queryPath,
        config: task.config,
    };
    const cancelled = await transitionImageTask(task, ["pending", "running"], { status: "cancelled", error: "任务已取消", retryable: false }, cancellationExecutionPatch(target));
    if (!cancelled) return NextResponse.json({ error: "当前任务无法取消" }, { status: 409 });
    const origin = resolveInternalOrigin(new URL(request.url).origin);
    after(() => runGenerationTaskRecoveryBatch({ origin, publicOrigin: requestPublicOrigin(request), limit: 1, taskIds: [task.id] }));
    const refreshedUser = await getCurrentUser(request);
    return NextResponse.json({ task: { id: cancelled.id, kind: cancelled.kind, status: cancelled.status, model: generationModelId(cancelled.config), result: cancelled.result, error: cancelled.error } }, { headers: pointsResponseHeaders(refreshedUser) });
}
