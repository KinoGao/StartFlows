import { randomUUID } from "node:crypto";

import { createStoredGenerationTask, getStoredGenerationTask, mutateStoredGenerationTask, touchStoredGenerationTask, transitionStoredGenerationTask, type GenerationTaskContext } from "@/lib/server/generation-task-store";
import type { SystemGenerationChannelConfig } from "@/lib/server/generation-channel";
import type { GenerationAttempt } from "@/lib/server/generation-attempt";
import { GENERATION_TASK_RETENTION_MS } from "@/lib/server/generation-task-retention";

export type VideoTaskStatus = "running" | "success" | "error" | "cancelled";

export type VideoTask = GenerationTaskContext & {
    id: string;
    userId: string;
    username?: string;
    displayName?: string;
    title?: string;
    status: VideoTaskStatus;
    createdAt: number;
    updatedAt: number;
    config: SystemGenerationChannelConfig;
    upstream: { id: string; provider: "openai" | "seedance" | "generation"; model: string; pollPath?: string; queryPath?: string; resultUrl?: string; pointsCost?: number; pointsUnits?: number; pointsRecordId?: string; refunded?: boolean };
    requestedDurationSeconds?: number;
    source?: string;
    prompt?: string;
    attempts?: GenerationAttempt[];
    polling?: { lastAttemptAt?: number; nextAttemptAt?: number };
    result?: { url?: string; remoteUrl?: string; mimeType?: string; durationMs?: number };
    error?: string;
    retryable?: boolean;
};

export async function createVideoTask(input: Omit<VideoTask, "id" | "status" | "createdAt" | "updatedAt">) {
    const now = Date.now();
    return createStoredGenerationTask("video", { ...input, id: randomUUID(), status: "running" as const, createdAt: now, updatedAt: now }, GENERATION_TASK_RETENTION_MS);
}

export async function getVideoTask(id: string) {
    return getStoredGenerationTask<VideoTask>("video", id);
}

export function claimVideoTaskPoll(id: string, intervalMs: number) {
    const now = Date.now();
    return mutateStoredGenerationTask<VideoTask>("video", id, GENERATION_TASK_RETENTION_MS, (task) => {
        if (!canReconcileVideoTask(task) || Number(task.polling?.nextAttemptAt || 0) > now) return null;
        return { ...task, polling: { lastAttemptAt: now, nextAttemptAt: now + Math.max(1_000, intervalMs) } };
    });
}

export function completeReconciledVideoTask(id: string, result: NonNullable<VideoTask["result"]>) {
    return mutateStoredGenerationTask<VideoTask>("video", id, GENERATION_TASK_RETENTION_MS, (task) => (canReconcileVideoTask(task) ? { ...task, status: "success", result, error: undefined, retryable: false } : null));
}

export function failReconciledVideoTask(id: string, error: string, retryable = false) {
    return mutateStoredGenerationTask<VideoTask>("video", id, GENERATION_TASK_RETENTION_MS, (task) => (canReconcileVideoTask(task) ? { ...task, status: "error", result: undefined, error, retryable } : null));
}

export function transitionVideoTask(
    task: VideoTask,
    patch: Partial<Pick<VideoTask, "result" | "error" | "retryable" | "upstream">> & { status: "success" | "error" | "cancelled" },
    executionPatch?: import("@/lib/server/generation-task-scheduler").GenerationTaskSchedulePatch,
) {
    return transitionStoredGenerationTask<VideoTask>("video", task.id, task.userId, ["running"], patch, GENERATION_TASK_RETENTION_MS, executionPatch);
}

export function updateVideoTask(id: string, patch: Partial<Pick<VideoTask, "config" | "upstream" | "requestedDurationSeconds" | "attempts" | "result">>) {
    return mutateStoredGenerationTask<VideoTask>("video", id, GENERATION_TASK_RETENTION_MS, (task) => ({ ...task, ...patch }));
}

export function touchVideoTask(id: string) {
    return touchStoredGenerationTask("video", id, Date.now(), GENERATION_TASK_RETENTION_MS);
}

export function canReconcileVideoTask(task: Pick<VideoTask, "status" | "error">) {
    return task.status === "running" || (task.status === "error" && /视频生成超时|视频任务长时间未更新/.test(task.error || ""));
}
