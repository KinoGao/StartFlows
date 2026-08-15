import type { LogicalModelCapability } from "@/lib/auth/store";
import { recordChannelRuntimeFailure, recordChannelRuntimeSuccess } from "./channel-runtime-health";

export type GenerationAttempt = {
    attemptNo: number;
    channelId?: string;
    model: string;
    status: "running" | "succeeded" | "failed";
    startedAt: number;
    completedAt?: number;
    pointsCost?: number;
    pointsRecordId?: string;
    error?: string;
    capability?: LogicalModelCapability;
};

export function startGenerationAttempt(attempts: GenerationAttempt[] | undefined, input: Pick<GenerationAttempt, "channelId" | "model" | "capability">) {
    const attempt: GenerationAttempt = { attemptNo: (attempts?.length || 0) + 1, ...input, status: "running", startedAt: Date.now() };
    return { attempt, attempts: [...(attempts || []), attempt] };
}

export function finishGenerationAttempt(attempts: GenerationAttempt[], attemptNo: number, patch: Pick<GenerationAttempt, "status"> & Partial<Pick<GenerationAttempt, "completedAt" | "pointsCost" | "pointsRecordId" | "error">>) {
    return attempts.map((attempt) => {
        if (attempt.attemptNo !== attemptNo) return attempt;
        const completed = { ...attempt, ...patch, completedAt: patch.completedAt || Date.now() };
        if (attempt.capability && attempt.channelId) {
            if (patch.status === "succeeded") recordChannelRuntimeSuccess(attempt.channelId, attempt.capability, completed.completedAt);
            if (patch.status === "failed") recordChannelRuntimeFailure(attempt.channelId, attempt.capability, patch.error, completed.completedAt);
        }
        return completed;
    });
}
