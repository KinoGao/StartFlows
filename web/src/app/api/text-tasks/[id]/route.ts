import { after, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { runGenerationTaskRecoveryBatch } from "@/lib/server/generation-task-recovery-service";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { getTextTask, transitionTextTask } from "@/lib/server/text-task-store";
import { pointsResponseHeaders } from "@/lib/server/points-response";
import { generationModelId } from "@/lib/server/generation-channel";
import { cancellationExecutionPatch, type GenerationCancellationTarget } from "@/lib/server/generation-task-cancellation-service";
import { refundTextTask } from "@/lib/server/text-task-refund";
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
    const task = await getTextTask(id);
    if (!task || (task.userId !== currentUser.id && currentUser.role !== "admin")) return NextResponse.json({ error: "任务不存在或已过期" }, { status: 404 });
    const schedule = await getStoredGenerationTaskRecord("text", task.id);
    const executionPhase = schedule?.executionPhase || settledExecutionPhase(task.status);
    if (((task.status === "pending" || task.status === "running") && executionPhase !== "needs_review") || (task.status === "cancelled" && (executionPhase === "cancel_requested" || executionPhase === "cancel_polling"))) {
        const origin = resolveInternalOrigin(new URL(request.url).origin);
        after(() => runGenerationTaskRecoveryBatch({ origin, cookie: request.headers.get("cookie") || "", limit: 1, taskIds: [task.id] }));
    }

    const shouldRefund = Boolean(task.billing?.pointsRecordId && !task.billing.refunded && task.status === "error");
    const settledTask = shouldRefund ? await refundTextTask(task) : task;
    const refreshedUser = shouldRefund ? await getCurrentUser(request) : currentUser;
    return NextResponse.json(
        {
            task: {
                id: settledTask.id,
                status: settledTask.status,
                model: generationModelId(settledTask.config),
                result: settledTask.result,
                error: settledTask.error,
                needsReview: executionPhase === "needs_review",
                reviewReason: executionPhase === "needs_review" ? task.reviewReason : undefined,
                executionPhase,
            },
        },
        { headers: pointsResponseHeaders(refreshedUser) },
    );
}

export async function PATCH(request: Request, context: RouteContext) {
    const user = await getCurrentUser(request);
    const task = user ? await getTextTask((await context.params).id) : null;
    if (!user || !task || (task.userId !== user.id && user.role !== "admin")) return NextResponse.json({ error: "任务不存在或已过期" }, { status: user ? 404 : 401 });
    const schedule = await getStoredGenerationTaskRecord("text", task.id);
    const executionPhase = schedule?.executionPhase || settledExecutionPhase(task.status);
    const parsed = await readJsonBodyResult<{ status?: string }>(request);
    if (!parsed.ok) return NextResponse.json({ error: parsed.message }, { status: parsed.status });
    const body = parsed.data;
    if (body.status !== "cancelled" || !["pending", "running"].includes(task.status)) return NextResponse.json({ error: "当前任务无法取消" }, { status: 409 });
    const target: GenerationCancellationTarget = {
        type: "text",
        taskId: task.id,
        userId: task.userId,
        executionPhase,
        upstreamTaskId: task.upstream?.id,
        queryPath: task.config.advancedConfig?.queryPath,
        config: task.config,
    };
    const cancelled = await transitionTextTask(task, ["pending", "running"], { status: "cancelled", error: "任务已取消", messages: [] }, cancellationExecutionPatch(target));
    if (!cancelled) return NextResponse.json({ error: "当前任务无法取消" }, { status: 409 });
    const origin = resolveInternalOrigin(new URL(request.url).origin);
    after(() => runGenerationTaskRecoveryBatch({ origin, limit: 1, taskIds: [task.id] }));
    const refreshedUser = await getCurrentUser(request);
    return NextResponse.json({ task: { id: cancelled.id, status: cancelled.status, model: generationModelId(cancelled.config), result: cancelled.result, error: cancelled.error } }, { headers: pointsResponseHeaders(refreshedUser) });
}

function settledExecutionPhase(status: string) {
    return status === "pending" || status === "running" ? "created" : "completed";
}
