import { randomUUID } from "node:crypto";

import { generationTaskNextPollAt, claimDueGenerationTasks, releaseGenerationTaskLease, renewGenerationTaskLeases, scheduleGenerationTask, type GenerationTaskLease } from "@/lib/server/generation-task-scheduler";
import { failVideoTaskFromWorker, persistVideoTaskResult, queryVideoTaskUpstream } from "@/lib/server/video-task-runtime";
import { getVideoTask, type VideoTask } from "@/lib/server/video-task-store";
import { createAudioTaskUpstreamStep, markAudioTaskFailed, persistAudioTaskResult, queryAudioTaskUpstreamStep } from "@/lib/server/audio-task-runtime";
import { getAudioTask, updateAudioTask, type AudioTask } from "@/lib/server/audio-task-store";
import { createImageTaskUpstreamStep, markImageTaskFailed, persistImageTaskResult, queryCancelledImageTaskUpstreamStep, queryImageTaskUpstreamStep } from "@/lib/server/image-task-runtime";
import { getImageTask, updateImageTask, type ImageTask } from "@/lib/server/image-task-store";
import { getTextTask, updateTextTask } from "@/lib/server/text-task-store";
import { queryCancelledTextTaskUpstreamStep, runTextTaskStep } from "@/lib/server/text-task-runtime";
import { maintenanceWorkerContext } from "@/lib/server/maintenance-auth";
import { executeAgentRun } from "@/lib/server/agent-run-executor";
import { processAgentRunReview } from "@/lib/server/agent-run-execution";
import { getAgentRun, type AgentRun } from "@/lib/server/agent-run-store";
import { hasCancellableUpstreamTaskId, isCancellationExecutionPhase, requestUpstreamGenerationCancellation, type GenerationCancellationTarget } from "@/lib/server/generation-task-cancellation-service";
import { resolveModelRequestTimeoutMs } from "@/lib/server/model-request-policy";
import { refundAudioTask } from "@/lib/server/audio-task-refund";
import { refundImageTask } from "@/lib/server/image-task-refund";
import { refundTextTask } from "@/lib/server/text-task-refund";
import { refundVideoTask } from "@/lib/server/video-task-refund";
import { toSafeGenerationErrorMessage } from "@/lib/server/generation-errors";
import { getAuthSettings } from "@/lib/auth/store";

type RecoveryResult = "pending" | "result_ready" | "completed" | "failed" | "needs_review" | "deferred";

export async function runGenerationTaskRecoveryBatch(input: { origin: string; publicOrigin?: string; cookie?: string; limit?: number; taskIds?: string[]; workerId?: string }) {
    const workerId = input.workerId?.trim().slice(0, 160) || `generation-worker:${process.pid}:${randomUUID()}`;
    const leases = await claimDueGenerationTasks({ workerId, limit: input.limit, taskIds: input.taskIds, leaseMs: 90_000 });
    if (!leases.length) return { claimed: 0, pending: 0, resultReady: 0, completed: 0, failed: 0, needsReview: 0, deferred: 0 };

    const taskIds = leases.map((lease) => lease.id);
    const heartbeat = setInterval(() => {
        void renewGenerationTaskLeases(workerId, taskIds, 90_000).catch((error) => console.error("Generation worker lease heartbeat failed", { workerId, error }));
    }, 25_000);
    try {
        const persistence = leases.filter(needsPersistence);
        const queries = leases.filter((lease) => !needsPersistence(lease));
        const results = [
            ...(await runWithConcurrency(queries, 20, (lease) => processGenerationTaskLease(lease, workerId, input.origin, input.publicOrigin || input.origin, input.cookie || ""))),
            ...(await runWithConcurrency(persistence, 4, (lease) => processGenerationTaskLease(lease, workerId, input.origin, input.publicOrigin || input.origin, input.cookie || ""))),
        ];
        return summarize(results);
    } finally {
        clearInterval(heartbeat);
    }
}

async function processGenerationTaskLease(lease: GenerationTaskLease, workerId: string, origin: string, publicOrigin: string, cookie: string): Promise<RecoveryResult> {
    if (lease.status === "cancelled" && isCancellationExecutionPhase(lease.executionPhase)) return processCancelledLease(lease, workerId, origin);
    if (lease.type === "text") return processTextLease(lease, workerId, origin, cookie);
    if (lease.type === "image") return processImageLease(lease, workerId, origin, publicOrigin, cookie);
    if (lease.type === "audio") return processAudioLease(lease, workerId, origin, cookie);
    if (lease.type === "agent") return processAgentLease(lease, workerId, origin, cookie);
    if (lease.type !== "video") {
        await releaseGenerationTaskLease(lease.type, lease.id, workerId, { executionPhase: "needs_review", nextPollAt: undefined, lastUpstreamStatus: "worker_handler_missing" });
        return "needs_review";
    }
    return processVideoLease(lease, workerId, origin, cookie);
}

async function processCancelledLease(lease: GenerationTaskLease, workerId: string, origin: string): Promise<RecoveryResult> {
    const target = await cancelledTaskTarget(lease);
    if (!target) {
        await releaseGenerationTaskLease(lease.type, lease.id, workerId, { executionPhase: "completed", nextPollAt: undefined, lastUpstreamStatus: "cancelled_task_missing" }, { cancellation: true });
        return "completed";
    }
    const now = Date.now();
    const requestedAt = cancellationRequestedAt(lease, now);
    if (lease.executionPhase === "cancel_requested") {
        if (!hasCancellableUpstreamTaskId(target.upstreamTaskId)) {
            const status = target.executionPhase === "created" ? "cancelled_before_submission" : "cancel_unconfirmed";
            await finishCancelledLease(target, lease, workerId, status);
            return "completed";
        }
        const cancellation = await requestUpstreamGenerationCancellation(target, origin, "", target.userId);
        if (cancellation === "not_submitted") {
            await finishCancelledLease(target, lease, workerId, "cancelled_before_submission");
            return "completed";
        }
        await releaseGenerationTaskLease(
            lease.type,
            lease.id,
            workerId,
            {
                executionPhase: "cancel_polling",
                nextPollAt: generationTaskNextPollAt({ submittedAt: requestedAt, now }),
                lastPollAt: now,
                lastUpstreamStatus: cancellation === "accepted" ? "cancel_accepted_polling" : cancellation === "unsupported" ? "cancel_unsupported_polling" : "cancel_deferred_polling",
                resultPayload: { ...lease.resultPayload, cancellationRequestedAt: requestedAt },
            },
            { cancellation: true },
        );
        return cancellation === "deferred" ? "deferred" : "pending";
    }
    if (now - requestedAt >= resolveModelRequestTimeoutMs(target.config, target.type)) {
        await finishCancelledLease(target, lease, workerId, "cancel_unconfirmed");
        return "completed";
    }
    try {
        const status = await queryCancelledUpstream(target, origin);
        if (status.state === "terminal") {
            await finishCancelledLease(target, lease, workerId, `cancelled_upstream_${status.status}`);
            return "completed";
        }
        await releaseGenerationTaskLease(
            lease.type,
            lease.id,
            workerId,
            {
                executionPhase: "cancel_polling",
                nextPollAt: generationTaskNextPollAt({ submittedAt: requestedAt, now }),
                lastPollAt: now,
                lastUpstreamStatus: `cancel_polling:${status.status}`,
                resultPayload: { ...lease.resultPayload, cancellationRequestedAt: requestedAt },
            },
            { cancellation: true },
        );
        return "pending";
    } catch (error) {
        const count = errorCount(lease.lastUpstreamStatus) + 1;
        await releaseGenerationTaskLease(
            lease.type,
            lease.id,
            workerId,
            {
                executionPhase: "cancel_polling",
                nextPollAt: generationTaskNextPollAt({ submittedAt: requestedAt, consecutiveErrors: count }),
                lastPollAt: now,
                lastUpstreamStatus: `cancel_query_error:${count}`,
                resultPayload: { ...lease.resultPayload, cancellationRequestedAt: requestedAt },
            },
            { cancellation: true },
        );
        console.warn("Cancelled generation task reconciliation deferred", { taskId: lease.id, type: lease.type, error: safeError(error) });
        return "deferred";
    }
}

async function cancelledTaskTarget(lease: GenerationTaskLease): Promise<GenerationCancellationTarget | null> {
    const submissionPhase = cancellationSubmissionPhase(lease);
    if (lease.type === "image") {
        const task = await getImageTask(lease.id);
        return task ? { type: "image", taskId: task.id, userId: task.userId, executionPhase: submissionPhase, upstreamTaskId: task.upstream?.id || lease.upstreamTaskId, queryPath: task.config.advancedConfig?.queryPath, config: task.config } : null;
    }
    if (lease.type === "video") {
        const task = await getVideoTask(lease.id);
        return task
            ? {
                  type: "video",
                  taskId: task.id,
                  userId: task.userId,
                  executionPhase: submissionPhase,
                  upstreamTaskId: task.upstream.id || lease.upstreamTaskId,
                  queryPath: task.upstream.queryPath || task.config.advancedConfig?.queryPath,
                  config: task.config,
              }
            : null;
    }
    if (lease.type === "audio") {
        const task = await getAudioTask(lease.id);
        return task ? { type: "audio", taskId: task.id, userId: task.userId, executionPhase: submissionPhase, upstreamTaskId: task.upstream?.id || lease.upstreamTaskId, queryPath: task.config.advancedConfig?.queryPath, config: task.config } : null;
    }
    if (lease.type === "text") {
        const task = await getTextTask(lease.id);
        return task ? { type: "text", taskId: task.id, userId: task.userId, executionPhase: submissionPhase, upstreamTaskId: task.upstream?.id || lease.upstreamTaskId, queryPath: task.config.advancedConfig?.queryPath, config: task.config } : null;
    }
    return null;
}

async function queryCancelledUpstream(target: GenerationCancellationTarget, origin: string) {
    if (target.type === "image") {
        const task = await getImageTask(target.taskId);
        return task ? queryCancelledImageTaskUpstreamStep(task, origin, "", target.userId) : { state: "terminal" as const, status: "missing" };
    }
    if (target.type === "video") {
        const task = await getVideoTask(target.taskId);
        if (!task) return { state: "terminal" as const, status: "missing" };
        const step = await queryVideoTaskUpstream(task, origin, "", target.userId);
        return step.state === "pending" ? { state: "pending" as const, status: step.status } : { state: "terminal" as const, status: step.status };
    }
    if (target.type === "audio") {
        const task = await getAudioTask(target.taskId);
        if (!task) return { state: "terminal" as const, status: "missing" };
        const step = await queryAudioTaskUpstreamStep(task, origin, "", target.userId);
        return step.state === "pending" ? { state: "pending" as const, status: step.status } : { state: "terminal" as const, status: "status" in step ? step.status : "completed" };
    }
    const task = await getTextTask(target.taskId);
    return task ? queryCancelledTextTaskUpstreamStep(task, origin, maintenanceWorkerContext(target.userId)) : { state: "terminal" as const, status: "missing" };
}

async function finishCancelledLease(target: GenerationCancellationTarget, lease: GenerationTaskLease, workerId: string, status: string) {
    if (status !== "cancel_unconfirmed" && status !== "cancelled_task_missing") await refundCancelledTask(target);
    await releaseGenerationTaskLease(lease.type, lease.id, workerId, { executionPhase: "completed", nextPollAt: undefined, lastPollAt: Date.now(), lastUpstreamStatus: status }, { cancellation: true });
    await redactCancelledTaskSecret(target).catch((error) => console.warn("Cancelled generation task secret cleanup failed", { taskId: target.taskId, type: target.type, error: safeError(error) }));
}

async function refundCancelledTask(target: GenerationCancellationTarget) {
    if (target.type === "image") {
        const task = await getImageTask(target.taskId);
        if (task) await refundImageTask(task);
        return;
    }
    if (target.type === "video") {
        const task = await getVideoTask(target.taskId);
        if (task) await refundVideoTask(task);
        return;
    }
    if (target.type === "audio") {
        const task = await getAudioTask(target.taskId);
        if (task) await refundAudioTask(task);
        return;
    }
    const task = await getTextTask(target.taskId);
    if (task) await refundTextTask(task);
}

async function redactCancelledTaskSecret(target: GenerationCancellationTarget) {
    if (target.type === "video") return;
    if (target.type === "image") {
        const task = await getImageTask(target.taskId);
        if (task) await updateImageTask(target.taskId, { config: { ...task.config, apiKey: "" } });
        return;
    }
    if (target.type === "audio") {
        const task = await getAudioTask(target.taskId);
        if (task) await updateAudioTask(target.taskId, { config: { ...task.config, apiKey: "" } });
        return;
    }
    const task = await getTextTask(target.taskId);
    if (task) await updateTextTask(target.taskId, { config: { ...task.config, apiKey: "" } });
}

function cancellationRequestedAt(lease: GenerationTaskLease, fallback: number) {
    const value = Number(lease.resultPayload?.cancellationRequestedAt);
    return Number.isFinite(value) && value > 0 ? value : lease.lastPollAt || lease.submittedAt || fallback;
}

function cancellationSubmissionPhase(lease: GenerationTaskLease) {
    const value = lease.resultPayload?.submissionPhase;
    return value === "created" ? value : undefined;
}

async function processAgentLease(lease: GenerationTaskLease, workerId: string, origin: string, cookie: string): Promise<RecoveryResult> {
    const run = await getAgentRun(lease.id);
    if (run?.status === "completed" && !run.reviewed && (lease.executionPhase === "review_pending" || lease.executionPhase === "reviewing")) {
        const result = await processAgentRunReview(run, origin, cookie || maintenanceWorkerContext(run.userId));
        await releaseGenerationTaskLease("agent", run.id, workerId, {
            executionPhase: result.status === "unavailable" ? "review_unavailable" : "completed",
            nextPollAt: undefined,
            lastUpstreamStatus: result.status === "unavailable" ? "review_unavailable" : "review_completed",
        });
        return "completed";
    }
    if (!run || run.status === "completed" || run.status === "failed" || run.status === "cancelled" || run.status === "paused") {
        await releaseGenerationTaskLease("agent", lease.id, workerId, { executionPhase: "completed", nextPollAt: undefined, lastUpstreamStatus: run?.status || "missing" });
        return run?.status === "completed" ? "completed" : "failed";
    }
    try {
        const childTaskIds = pendingAgentChildTaskIds(run);
        if (childTaskIds.length) {
            const batchSize = (await getAuthSettings()).dataLifecycle.maintenanceBatchSize;
            for (let offset = 0; offset < childTaskIds.length; offset += batchSize) {
                const taskIds = childTaskIds.slice(offset, offset + batchSize);
                await runGenerationTaskRecoveryBatch({
                    origin,
                    cookie: cookie || maintenanceWorkerContext(run.userId),
                    limit: taskIds.length,
                    taskIds,
                    workerId: `${workerId}:children`.slice(0, 160),
                });
            }
        }
        await executeAgentRun(run, origin, cookie || maintenanceWorkerContext(run.userId));
        const latest = await getAgentRun(run.id);
        if (!latest || latest.status === "completed" || latest.status === "failed" || latest.status === "cancelled" || latest.status === "paused") {
            await releaseGenerationTaskLease("agent", run.id, workerId, { executionPhase: "completed", nextPollAt: undefined, lastUpstreamStatus: latest?.status || "missing" });
            return latest?.status === "completed" ? "completed" : "failed";
        }
        await releaseGenerationTaskLease("agent", run.id, workerId, {
            executionPhase: "polling",
            nextPollAt: generationTaskNextPollAt({ submittedAt: lease.submittedAt || run.createdAt }),
            lastPollAt: Date.now(),
            lastUpstreamStatus: latest.status,
        });
        return "pending";
    } catch (error) {
        const latest = await getAgentRun(run.id);
        if (latest?.status === "failed") {
            await releaseGenerationTaskLease("agent", run.id, workerId, { executionPhase: "completed", nextPollAt: undefined, lastUpstreamStatus: "failed" });
            return "failed";
        }
        const count = errorCount(lease.lastUpstreamStatus) + 1;
        await releaseGenerationTaskLease("agent", run.id, workerId, {
            executionPhase: "polling",
            nextPollAt: generationTaskNextPollAt({ consecutiveErrors: count }),
            lastPollAt: Date.now(),
            lastUpstreamStatus: `query_error:${count}`,
        });
        console.warn("Agent task recovery deferred", { runId: run.id, error: safeError(error) });
        return "deferred";
    }
}

export function pendingAgentChildTaskIds(run: Pick<AgentRun, "tasks">) {
    return Array.from(
        new Set(
            run.tasks.flatMap((task) => {
                if (task.status !== "running") return [];
                if (task.childTasks?.length) return task.childTasks.filter((child) => child.status === "pending").map((child) => child.id);
                return task.taskIds?.length ? task.taskIds : task.taskId ? [task.taskId] : [];
            }),
        ),
    );
}

async function processTextLease(lease: GenerationTaskLease, workerId: string, origin: string, cookie: string): Promise<RecoveryResult> {
    const task = await getTextTask(lease.id);
    if (!task || task.status === "success" || task.status === "error" || task.status === "cancelled") {
        await releaseGenerationTaskLease("text", lease.id, workerId, { executionPhase: "completed", nextPollAt: undefined });
        return task?.status === "success" ? "completed" : "failed";
    }
    if (lease.executionPhase === "submitting" && task.status === "running" && !task.upstream?.id) {
        await releaseGenerationTaskLease("text", lease.id, workerId, {
            executionPhase: "needs_review",
            nextPollAt: undefined,
            lastUpstreamStatus: "submission_outcome_unknown",
            resultPayload: reviewPayload(lease, "文本任务在提交阶段中断，未取得上游任务 ID"),
        });
        return "needs_review";
    }
    if (!task.upstream?.id)
        await scheduleGenerationTask("text", task.id, {
            executionPhase: "submitting",
            channelId: task.config.channelId,
            provider: task.config.advancedConfig?.protocol || task.config.apiFormat,
            queryPath: task.config.advancedConfig?.queryPath,
            nextPollAt: lease.nextPollAt,
            lastUpstreamStatus: "submitting",
        });
    try {
        const step = await runTextTaskStep(task, origin, cookie || maintenanceWorkerContext(task.userId));
        if (step.state === "completed") {
            await releaseGenerationTaskLease("text", task.id, workerId, { executionPhase: "completed", nextPollAt: undefined, lastUpstreamStatus: "completed" });
            return "completed";
        }
        if (step.state === "failed") {
            await releaseGenerationTaskLease("text", task.id, workerId, { executionPhase: "completed", nextPollAt: undefined, lastUpstreamStatus: "failed" });
            return "failed";
        }
        if (step.state === "needs_review") {
            await releaseGenerationTaskLease("text", task.id, workerId, {
                executionPhase: "needs_review",
                nextPollAt: undefined,
                lastUpstreamStatus: "submission_outcome_unknown",
                resultPayload: reviewPayload(lease, step.error),
            });
            console.warn("Text task submission needs review", { taskId: task.id, error: step.error });
            return "needs_review";
        }
        const latest = (await getTextTask(task.id)) || task;
        const submittedAt = lease.submittedAt || Date.now();
        await releaseGenerationTaskLease("text", task.id, workerId, {
            executionPhase: lease.submittedAt ? "polling" : "submitted",
            upstreamTaskId: step.upstreamTaskId,
            channelId: latest.config.channelId,
            provider: latest.config.advancedConfig?.protocol || latest.config.apiFormat,
            queryPath: latest.config.advancedConfig?.queryPath,
            submittedAt,
            nextPollAt: generationTaskNextPollAt({ submittedAt }),
            lastPollAt: Date.now(),
            lastUpstreamStatus: step.status,
        });
        return "pending";
    } catch (error) {
        const latest = await getTextTask(task.id);
        const upstreamTaskId = latest?.upstream?.id || lease.upstreamTaskId;
        const count = errorCount(lease.lastUpstreamStatus) + 1;
        await releaseGenerationTaskLease("text", task.id, workerId, {
            executionPhase: upstreamTaskId ? "polling" : "needs_review",
            upstreamTaskId,
            nextPollAt: upstreamTaskId ? generationTaskNextPollAt({ submittedAt: lease.submittedAt, consecutiveErrors: count }) : undefined,
            lastPollAt: Date.now(),
            lastUpstreamStatus: upstreamTaskId ? `query_error:${count}` : "submission_outcome_unknown",
            ...(!upstreamTaskId ? { resultPayload: reviewPayload(lease, safeReviewReason(error, "文本任务创建结果未知")) } : {}),
        });
        console.warn(upstreamTaskId ? "Text task recovery deferred" : "Text task execution needs review", { taskId: task.id, error: safeError(error) });
        return upstreamTaskId ? "deferred" : "needs_review";
    }
}

async function processImageLease(lease: GenerationTaskLease, workerId: string, origin: string, publicOrigin: string, cookie: string): Promise<RecoveryResult> {
    const task = await getImageTask(lease.id);
    if (!task || task.status === "success" || task.status === "cancelled") {
        await releaseGenerationTaskLease("image", lease.id, workerId, { executionPhase: "completed", nextPollAt: undefined });
        return "completed";
    }
    if (lease.executionPhase === "submitting" && !lease.upstreamTaskId && task.status === "running") {
        if (task.upstream?.id) {
            const submittedAt = lease.submittedAt || Date.now();
            await releaseGenerationTaskLease("image", lease.id, workerId, {
                executionPhase: "submitted",
                upstreamTaskId: task.upstream.id,
                channelId: task.config.channelId,
                provider: task.config.advancedConfig?.protocol || task.config.apiFormat,
                queryPath: task.upstream.explicitPollUrl || task.config.advancedConfig?.queryPath,
                submittedAt,
                nextPollAt: submittedAt,
                lastUpstreamStatus: "recovered_submitted",
            });
            return "pending";
        }
        await releaseGenerationTaskLease("image", lease.id, workerId, {
            executionPhase: "needs_review",
            nextPollAt: undefined,
            lastUpstreamStatus: "submission_outcome_unknown",
            resultPayload: reviewPayload(lease, "图片任务在提交阶段中断，未取得上游任务 ID"),
        });
        return "needs_review";
    }
    if (needsPersistence(lease)) return persistImageLease(task, lease, workerId, origin, cookie);
    try {
        const step = task.upstream?.id ? await queryImageTaskUpstreamStep(task, origin, cookie, cookie ? "" : task.userId) : await createImageTaskUpstreamStep(task, origin, publicOrigin, cookie, cookie ? "" : task.userId);
        const now = Date.now();
        if (step.state === "failed") {
            await markImageTaskFailed(task, step.error);
            await releaseGenerationTaskLease("image", task.id, workerId, { executionPhase: "completed", nextPollAt: undefined, lastPollAt: now, lastUpstreamStatus: step.status });
            return "failed";
        }
        if (step.state === "needs_review") {
            const latest = (await getImageTask(task.id)) || task;
            await releaseGenerationTaskLease("image", task.id, workerId, {
                executionPhase: "needs_review",
                upstreamTaskId: latest.upstream?.id || lease.upstreamTaskId,
                channelId: latest.config.channelId,
                provider: latest.config.advancedConfig?.protocol || latest.config.apiFormat,
                queryPath: latest.config.advancedConfig?.queryPath,
                nextPollAt: undefined,
                lastPollAt: now,
                lastUpstreamStatus: `${step.status}:${step.reason}`.slice(0, 500),
                resultPayload: reviewPayload(lease, step.reason),
            });
            return "needs_review";
        }
        if (step.state === "completed") {
            await releaseGenerationTaskLease("image", task.id, workerId, { executionPhase: "completed", nextPollAt: undefined, lastUpstreamStatus: "persisted" });
            return "completed";
        }
        if (step.state === "result_ready") {
            await releaseGenerationTaskLease("image", task.id, workerId, { executionPhase: "result_ready", nextPollAt: now, lastPollAt: now, lastUpstreamStatus: step.status, resultPayload: { url: step.resultUrl } });
            return "result_ready";
        }
        const latest = (await getImageTask(task.id)) || task;
        await releaseGenerationTaskLease("image", task.id, workerId, {
            executionPhase: latest.upstream?.id ? "polling" : "submitted",
            upstreamTaskId: step.upstream.id,
            channelId: latest.config.channelId,
            provider: latest.config.advancedConfig?.protocol || latest.config.apiFormat,
            queryPath: latest.config.advancedConfig?.queryPath,
            submittedAt: lease.submittedAt || now,
            nextPollAt: generationTaskNextPollAt({ submittedAt: lease.submittedAt || now, now }),
            lastPollAt: latest.upstream?.id ? now : undefined,
            lastUpstreamStatus: step.status,
        });
        return "pending";
    } catch (error) {
        const latest = await getImageTask(task.id);
        const count = errorCount(lease.lastUpstreamStatus) + 1;
        const upstreamTaskId = latest?.upstream?.id || lease.upstreamTaskId;
        const submitted = Boolean(upstreamTaskId);
        await releaseGenerationTaskLease("image", task.id, workerId, {
            executionPhase: submitted ? "polling" : "needs_review",
            upstreamTaskId,
            channelId: latest?.config.channelId,
            provider: latest ? latest.config.advancedConfig?.protocol || latest.config.apiFormat : undefined,
            queryPath: latest?.upstream?.explicitPollUrl || latest?.config.advancedConfig?.queryPath,
            nextPollAt: submitted ? generationTaskNextPollAt({ consecutiveErrors: count }) : undefined,
            lastPollAt: Date.now(),
            lastUpstreamStatus: submitted ? `query_error:${count}` : "submission_outcome_unknown",
            ...(!submitted ? { resultPayload: reviewPayload(lease, safeReviewReason(error, "图片任务创建结果未知")) } : {}),
        });
        console.warn("Image task step deferred", { taskId: task.id, error: safeError(error) });
        return submitted ? "deferred" : "needs_review";
    }
}

async function persistImageLease(task: ImageTask, lease: GenerationTaskLease, workerId: string, origin: string, cookie: string): Promise<RecoveryResult> {
    const resultUrl = typeof lease.resultPayload?.url === "string" ? lease.resultPayload.url.trim() : "";
    if (!resultUrl) {
        await markImageTaskFailed(task, "图片任务已完成但没有返回图片地址");
        await releaseGenerationTaskLease("image", task.id, workerId, { executionPhase: "completed", nextPollAt: undefined, lastUpstreamStatus: "result_url_missing" });
        return "failed";
    }
    await scheduleGenerationTask("image", task.id, { executionPhase: "persisting", nextPollAt: lease.nextPollAt });
    try {
        const completed = await persistImageTaskResult(task, origin, resultUrl, cookie, cookie ? "" : task.userId);
        if (!completed || completed.status !== "success") throw new Error("图片结果保存后未进入成功状态");
        await releaseGenerationTaskLease("image", task.id, workerId, { executionPhase: "completed", nextPollAt: undefined, lastUpstreamStatus: "persisted" });
        return "completed";
    } catch (error) {
        const count = errorCount(lease.lastUpstreamStatus) + 1;
        await releaseGenerationTaskLease("image", task.id, workerId, { executionPhase: "persisting", nextPollAt: generationTaskNextPollAt({ consecutiveErrors: count }), lastUpstreamStatus: `persist_error:${count}` });
        console.warn("Image result persistence deferred", { taskId: task.id, error: safeError(error) });
        return "deferred";
    }
}

async function processAudioLease(lease: GenerationTaskLease, workerId: string, origin: string, cookie: string): Promise<RecoveryResult> {
    const task = await getAudioTask(lease.id);
    if (!task || task.status === "success" || task.status === "cancelled") {
        await releaseGenerationTaskLease("audio", lease.id, workerId, { executionPhase: "completed", nextPollAt: undefined });
        return "completed";
    }
    if (lease.executionPhase === "submitting" && !lease.upstreamTaskId && task.status === "running") {
        if (task.upstream?.id) {
            const submittedAt = lease.submittedAt || Date.now();
            await releaseGenerationTaskLease("audio", lease.id, workerId, {
                executionPhase: "submitted",
                upstreamTaskId: task.upstream.id,
                channelId: task.config.channelId,
                provider: task.config.advancedConfig?.protocol || task.config.apiFormat,
                queryPath: task.config.advancedConfig?.queryPath,
                submittedAt,
                nextPollAt: submittedAt,
                lastUpstreamStatus: "recovered_submitted",
            });
            return "pending";
        }
        await releaseGenerationTaskLease("audio", lease.id, workerId, {
            executionPhase: "needs_review",
            nextPollAt: undefined,
            lastUpstreamStatus: "submission_outcome_unknown",
            resultPayload: reviewPayload(lease, "音频任务在提交阶段中断，未取得上游任务 ID"),
        });
        return "needs_review";
    }
    if (needsPersistence(lease)) return persistAudioLease(task, lease, workerId, origin, cookie);
    try {
        const step = task.upstream?.id ? await queryAudioTaskUpstreamStep(task, origin, cookie, cookie ? "" : task.userId) : await createAudioTaskUpstreamStep(task, origin, cookie, cookie ? "" : task.userId);
        const now = Date.now();
        if (step.state === "failed") {
            await markAudioTaskFailed(task, step.error);
            await releaseGenerationTaskLease("audio", task.id, workerId, { executionPhase: "completed", nextPollAt: undefined, lastPollAt: now, lastUpstreamStatus: step.status });
            return "failed";
        }
        if (step.state === "completed") {
            await releaseGenerationTaskLease("audio", task.id, workerId, { executionPhase: "completed", nextPollAt: undefined, lastUpstreamStatus: "persisted" });
            return "completed";
        }
        if (step.state === "result_ready") {
            await releaseGenerationTaskLease("audio", task.id, workerId, { executionPhase: "result_ready", nextPollAt: now, lastPollAt: now, lastUpstreamStatus: step.status, resultPayload: { url: step.resultUrl } });
            return "result_ready";
        }
        const latest = (await getAudioTask(task.id)) || task;
        await releaseGenerationTaskLease("audio", task.id, workerId, {
            executionPhase: latest.upstream?.id ? "polling" : "submitted",
            upstreamTaskId: step.upstreamTaskId,
            channelId: latest.config.channelId,
            provider: latest.config.advancedConfig?.protocol || latest.config.apiFormat,
            queryPath: latest.config.advancedConfig?.queryPath || step.createPath,
            submittedAt: lease.submittedAt || now,
            nextPollAt: generationTaskNextPollAt({ submittedAt: lease.submittedAt || now, now }),
            lastPollAt: latest.upstream?.id ? now : undefined,
            lastUpstreamStatus: step.status,
        });
        return "pending";
    } catch (error) {
        const latest = await getAudioTask(task.id);
        const upstreamTaskId = latest?.upstream?.id || lease.upstreamTaskId;
        const count = errorCount(lease.lastUpstreamStatus) + 1;
        await releaseGenerationTaskLease("audio", task.id, workerId, {
            executionPhase: upstreamTaskId ? "polling" : "needs_review",
            upstreamTaskId,
            channelId: latest?.config.channelId,
            provider: latest ? latest.config.advancedConfig?.protocol || latest.config.apiFormat : undefined,
            queryPath: latest?.config.advancedConfig?.queryPath,
            nextPollAt: upstreamTaskId ? generationTaskNextPollAt({ consecutiveErrors: count }) : undefined,
            lastPollAt: Date.now(),
            lastUpstreamStatus: upstreamTaskId ? `query_error:${count}` : "submission_outcome_unknown",
            ...(!upstreamTaskId ? { resultPayload: reviewPayload(lease, safeReviewReason(error, "音频任务创建结果未知")) } : {}),
        });
        return upstreamTaskId ? "deferred" : "needs_review";
    }
}

async function persistAudioLease(task: AudioTask, lease: GenerationTaskLease, workerId: string, origin: string, cookie: string): Promise<RecoveryResult> {
    const resultUrl = typeof lease.resultPayload?.url === "string" ? lease.resultPayload.url.trim() : "";
    if (!resultUrl) {
        await markAudioTaskFailed(task, "音频任务已完成但没有返回音频地址");
        await releaseGenerationTaskLease("audio", task.id, workerId, { executionPhase: "completed", nextPollAt: undefined, lastUpstreamStatus: "result_url_missing" });
        return "failed";
    }
    await scheduleGenerationTask("audio", task.id, { executionPhase: "persisting", nextPollAt: lease.nextPollAt });
    try {
        const completed = await persistAudioTaskResult(task, origin, resultUrl, cookie, cookie ? "" : task.userId);
        if (!completed || completed.status !== "success") throw new Error("音频结果保存后未进入成功状态");
        await releaseGenerationTaskLease("audio", task.id, workerId, { executionPhase: "completed", nextPollAt: undefined, lastUpstreamStatus: "persisted" });
        return "completed";
    } catch (error) {
        const count = errorCount(lease.lastUpstreamStatus) + 1;
        await releaseGenerationTaskLease("audio", task.id, workerId, { executionPhase: "persisting", nextPollAt: generationTaskNextPollAt({ consecutiveErrors: count }), lastUpstreamStatus: `persist_error:${count}` });
        console.warn("Audio result persistence deferred", { taskId: task.id, error: safeError(error) });
        return "deferred";
    }
}

async function processVideoLease(lease: GenerationTaskLease, workerId: string, origin: string, cookie: string): Promise<RecoveryResult> {
    const task = await getVideoTask(lease.id);
    if (!task || task.status === "success" || task.status === "cancelled") {
        await releaseGenerationTaskLease("video", lease.id, workerId, { executionPhase: "completed", nextPollAt: undefined });
        return "completed";
    }
    if (lease.executionPhase === "submitting" && !lease.upstreamTaskId) {
        if (task.upstream.id) {
            const submittedAt = lease.submittedAt || Date.now();
            await releaseGenerationTaskLease("video", lease.id, workerId, {
                executionPhase: "submitted",
                upstreamTaskId: task.upstream.id,
                channelId: task.config.channelId,
                provider: task.config.advancedConfig?.protocol || task.config.apiFormat,
                queryPath: task.upstream.queryPath || task.config?.advancedConfig?.queryPath,
                submittedAt,
                nextPollAt: submittedAt,
                lastUpstreamStatus: "recovered_submitted",
            });
            return "pending";
        }
        await releaseGenerationTaskLease("video", lease.id, workerId, { executionPhase: "needs_review", nextPollAt: undefined, lastUpstreamStatus: "submission_outcome_unknown" });
        return "needs_review";
    }
    if (needsPersistence(lease)) return persistVideoLease(task, lease, workerId, origin, cookie);

    try {
        const step = await queryVideoTaskUpstream(task, origin, cookie, cookie ? "" : task.userId);
        const now = Date.now();
        if (step.state === "failed") {
            await failVideoTaskFromWorker(task, step.error, true);
            await releaseGenerationTaskLease("video", task.id, workerId, { executionPhase: "completed", nextPollAt: undefined, lastPollAt: now, lastUpstreamStatus: step.status });
            return "failed";
        }
        if (step.state === "result_ready") {
            await releaseGenerationTaskLease("video", task.id, workerId, {
                executionPhase: "result_ready",
                nextPollAt: now,
                lastPollAt: now,
                lastUpstreamStatus: step.status,
                queryPath: task.upstream.queryPath || task.config?.advancedConfig?.queryPath,
                resultPayload: { url: step.resultUrl },
            });
            return "result_ready";
        }
        await releaseGenerationTaskLease("video", task.id, workerId, {
            executionPhase: "polling",
            upstreamTaskId: task.upstream.id || lease.upstreamTaskId,
            queryPath: task.upstream.queryPath || task.config?.advancedConfig?.queryPath,
            nextPollAt: generationTaskNextPollAt({ submittedAt: lease.submittedAt, now }),
            lastPollAt: now,
            lastUpstreamStatus: step.status,
        });
        return "pending";
    } catch (error) {
        const count = errorCount(lease.lastUpstreamStatus) + 1;
        await releaseGenerationTaskLease("video", task.id, workerId, {
            executionPhase: "polling",
            upstreamTaskId: task.upstream.id || lease.upstreamTaskId,
            queryPath: task.upstream.queryPath || task.config?.advancedConfig?.queryPath,
            nextPollAt: generationTaskNextPollAt({ submittedAt: lease.submittedAt, consecutiveErrors: count }),
            lastPollAt: Date.now(),
            lastUpstreamStatus: `query_error:${count}`,
        });
        console.warn("Video task query deferred", { taskId: task.id, error: safeError(error) });
        return "deferred";
    }
}

async function persistVideoLease(task: VideoTask, lease: GenerationTaskLease, workerId: string, origin: string, cookie: string): Promise<RecoveryResult> {
    const resultUrl = typeof lease.resultPayload?.url === "string" ? lease.resultPayload.url.trim() : "";
    if (!resultUrl) {
        await failVideoTaskFromWorker(task, "视频任务已完成但没有返回视频地址");
        await releaseGenerationTaskLease("video", task.id, workerId, { executionPhase: "completed", nextPollAt: undefined, lastUpstreamStatus: "result_url_missing" });
        return "failed";
    }
    await scheduleGenerationTask("video", task.id, { executionPhase: "persisting", nextPollAt: lease.nextPollAt });
    try {
        const completed = await persistVideoTaskResult(task, resultUrl, origin, cookie, cookie ? "" : task.userId);
        if (!completed || completed.status !== "success") throw new Error("视频结果保存后未进入成功状态");
        await releaseGenerationTaskLease("video", task.id, workerId, { executionPhase: "completed", nextPollAt: undefined, lastUpstreamStatus: "persisted" });
        return "completed";
    } catch (error) {
        const count = errorCount(lease.lastUpstreamStatus) + 1;
        await releaseGenerationTaskLease("video", task.id, workerId, {
            executionPhase: "persisting",
            nextPollAt: generationTaskNextPollAt({ consecutiveErrors: count }),
            lastUpstreamStatus: `persist_error:${count}`,
        });
        console.warn("Video result persistence deferred", { taskId: task.id, error: safeError(error) });
        return "deferred";
    }
}

function needsPersistence(lease: GenerationTaskLease) {
    return lease.executionPhase === "result_ready" || lease.executionPhase === "persisting";
}

async function runWithConcurrency<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) {
    const results: R[] = [];
    let cursor = 0;
    await Promise.all(
        Array.from({ length: Math.min(limit, items.length) }, async () => {
            while (cursor < items.length) {
                const index = cursor++;
                results[index] = await run(items[index]);
            }
        }),
    );
    return results;
}

function summarize(results: RecoveryResult[]) {
    return {
        claimed: results.length,
        pending: results.filter((item) => item === "pending").length,
        resultReady: results.filter((item) => item === "result_ready").length,
        completed: results.filter((item) => item === "completed").length,
        failed: results.filter((item) => item === "failed").length,
        needsReview: results.filter((item) => item === "needs_review").length,
        deferred: results.filter((item) => item === "deferred").length,
    };
}

function errorCount(status?: string) {
    const count = Number(status?.match(/(?:query|persist|cancel_query)_error:(\d+)/)?.[1] || 0);
    return Number.isFinite(count) ? Math.max(0, count) : 0;
}

function safeError(error: unknown) {
    return error instanceof Error ? error.message.slice(0, 300) : "unknown";
}

function safeReviewReason(error: unknown, fallback: string) {
    return toSafeGenerationErrorMessage(error, fallback).slice(0, 500);
}

function reviewPayload(lease: GenerationTaskLease, reviewReason: string) {
    return { ...(lease.resultPayload || {}), reviewReason: reviewReason.trim().slice(0, 500) || "上游提交结果需要人工确认" };
}
