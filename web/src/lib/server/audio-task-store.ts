import { randomUUID } from "node:crypto";
import { createStoredGenerationTask, getStoredGenerationTask, mutateStoredGenerationTask, touchStoredGenerationTask, transitionStoredGenerationTask, type GenerationTaskContext } from "@/lib/server/generation-task-store";
import type { LogicalModelCapabilityProfile, SystemChannelAdvancedConfig } from "@/lib/auth/store";
import type { GenerationAttempt } from "@/lib/server/generation-attempt";
import { GENERATION_TASK_RETENTION_MS } from "@/lib/server/generation-task-retention";

export type AudioTaskConfig = {
    apiSource?: "system" | "custom";
    baseUrl: string;
    apiKey: string;
    apiFormat: "openai" | "gemini";
    model: string;
    channelId?: string;
    logicalModel?: string;
    capabilityProfile?: LogicalModelCapabilityProfile;
    advancedConfig?: SystemChannelAdvancedConfig;
    voice?: string;
    format?: string;
    speed?: string;
    instructions?: string;
};
export type AudioTask = GenerationTaskContext & {
    id: string;
    userId: string;
    status: "pending" | "running" | "success" | "error" | "cancelled";
    createdAt: number;
    updatedAt: number;
    config: AudioTaskConfig;
    prompt: string;
    source?: string;
    upstream?: { id: string; createPath: string };
    result?: { url: string; mimeType: string };
    billing?: { pointsCost: number; pointsRecordId?: string; refunded: boolean };
    error?: string;
    candidateConfigs?: AudioTaskConfig[];
    attempts?: GenerationAttempt[];
    attemptNo?: number;
};

export function createAudioTask(input: Omit<AudioTask, "id" | "status" | "createdAt" | "updatedAt">) {
    const now = Date.now();
    return createStoredGenerationTask("audio", { ...input, id: randomUUID(), status: "pending", createdAt: now, updatedAt: now } satisfies AudioTask, GENERATION_TASK_RETENTION_MS);
}

export async function getAudioTask(id: string) {
    return getStoredGenerationTask<AudioTask>("audio", id);
}

export async function updateAudioTask(id: string, patch: Partial<Pick<AudioTask, "status" | "config" | "upstream" | "result" | "billing" | "error" | "candidateConfigs" | "attempts" | "attemptNo">>) {
    return mutateStoredGenerationTask<AudioTask>("audio", id, GENERATION_TASK_RETENTION_MS, (task) => ({ ...task, ...patch }));
}

export function transitionAudioTask(
    task: AudioTask,
    allowedStatuses: Array<AudioTask["status"]>,
    patch: Partial<Pick<AudioTask, "config" | "upstream" | "result" | "billing" | "error">> & { status: AudioTask["status"] },
    executionPatch?: import("@/lib/server/generation-task-scheduler").GenerationTaskSchedulePatch,
) {
    return transitionStoredGenerationTask<AudioTask>("audio", task.id, task.userId, allowedStatuses, patch, GENERATION_TASK_RETENTION_MS, executionPatch);
}

export function touchAudioTask(id: string) {
    return touchStoredGenerationTask("audio", id, Date.now(), GENERATION_TASK_RETENTION_MS);
}
