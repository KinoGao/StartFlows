import { protocolAuthHeaders } from "@/lib/channel-protocol-registry";
import type { ApiCallFormat, LogicalModelCapabilityProfile, SystemChannelAdvancedConfig } from "@/lib/auth/store";
import { fetchInternalApi, isInternalApiBaseUrl } from "@/lib/server/internal-origin";
import { maintenanceWorkerHeaders } from "@/lib/server/maintenance-auth";
import { providerTaskPath } from "@/lib/server/provider-task-config";
import { fetchSafeOutbound } from "@/lib/server/safe-outbound-fetch";
import { scheduleGenerationTask, type GenerationTaskExecutionPhase } from "@/lib/server/generation-task-scheduler";
import type { GenerationTaskType } from "@/lib/server/generation-task-store";
import { systemAiBillingHeaders } from "@/lib/server/system-ai-billing";

export type CancellableGenerationTaskType = Extract<GenerationTaskType, "text" | "image" | "video" | "audio">;

export type GenerationCancellationTarget = {
    type: CancellableGenerationTaskType;
    taskId: string;
    userId: string;
    executionPhase?: GenerationTaskExecutionPhase;
    upstreamTaskId?: string;
    queryPath?: string;
    config: {
        baseUrl: string;
        apiKey: string;
        apiFormat: ApiCallFormat;
        model: string;
        logicalModel?: string;
        channelId?: string;
        advancedConfig?: SystemChannelAdvancedConfig;
        capabilityProfile?: Pick<LogicalModelCapabilityProfile, "timeoutMs">;
    };
};

export type UpstreamCancellationResult = "accepted" | "unsupported" | "deferred" | "not_submitted";

export function isCancellationExecutionPhase(value: GenerationTaskExecutionPhase | undefined): value is "cancel_requested" | "cancel_polling" {
    return value === "cancel_requested" || value === "cancel_polling";
}

export function cancellationExecutionPatch(target: GenerationCancellationTarget, now = Date.now()) {
    const upstreamTaskId = cancellableUpstreamTaskId(target.upstreamTaskId);
    return {
        executionPhase: "cancel_requested" as const,
        upstreamTaskId: upstreamTaskId || undefined,
        channelId: target.config.channelId,
        provider: target.config.advancedConfig?.protocol || target.config.apiFormat,
        queryPath: target.queryPath || target.config.advancedConfig?.queryPath,
        nextPollAt: now,
        lastUpstreamStatus: upstreamTaskId ? "cancel_requested" : "cancel_requested_without_upstream_id",
        resultPayload: { cancellationRequestedAt: now, submissionPhase: target.executionPhase || "created" },
    };
}

export function scheduleCancelledGenerationTask(target: GenerationCancellationTarget) {
    return scheduleGenerationTask(target.type, target.taskId, cancellationExecutionPatch(target), { cancellation: true });
}

export async function requestUpstreamGenerationCancellation(target: GenerationCancellationTarget, origin: string, cookie = "", workerUserId = ""): Promise<UpstreamCancellationResult> {
    const upstreamTaskId = cancellableUpstreamTaskId(target.upstreamTaskId);
    if (!upstreamTaskId) return "not_submitted";
    const attempt = cancellationAttempt(target, upstreamTaskId);
    if (!attempt) return "unsupported";
    try {
        const response = await cancellationFetch(target, origin, cookie, workerUserId, attempt.path, attempt.method);
        await response.body?.cancel().catch(() => undefined);
        if (response.ok) return "accepted";
        return [404, 405, 501].includes(response.status) ? "unsupported" : "deferred";
    } catch {
        return "deferred";
    }
}

function cancellationAttempt(target: GenerationCancellationTarget, upstreamTaskId: string) {
    const configured = target.config.advancedConfig?.cancelPath?.trim();
    if (!configured) return null;
    return {
        path: providerTaskPath(configured, upstreamTaskId),
        method: target.config.advancedConfig?.cancelMethod === "DELETE" ? ("DELETE" as const) : ("POST" as const),
    };
}

async function cancellationFetch(target: GenerationCancellationTarget, origin: string, cookie: string, workerUserId: string, path: string, method: "POST" | "DELETE") {
    const internal = isInternalApiBaseUrl(target.config.baseUrl);
    const url = `${internal ? `${origin}${target.config.baseUrl}` : target.config.baseUrl}`.replace(/\/+$/, "") + (path.startsWith("/") ? path : `/${path}`);
    const headers = new Headers();
    if (internal) {
        if (workerUserId) Object.entries(maintenanceWorkerHeaders(workerUserId)).forEach(([key, value]) => headers.set(key, value));
        else if (cookie) headers.set("cookie", cookie);
        Object.entries(systemAiBillingHeaders(target.config.logicalModel || target.config.model, undefined, target.config.model)).forEach(([key, value]) => headers.set(key, value));
        return fetchInternalApi(url, { method, headers, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    }
    Object.entries(protocolAuthHeaders(target.config.apiKey, target.config.advancedConfig, target.config.apiFormat)).forEach(([key, value]) => headers.set(key, value));
    return fetchSafeOutbound(url, { method, headers, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(10_000) });
}

function cancellableUpstreamTaskId(value: string | undefined) {
    const id = value?.trim() || "";
    return id && !id.startsWith("direct:") ? id : "";
}

export function hasCancellableUpstreamTaskId(value: string | undefined) {
    return Boolean(cancellableUpstreamTaskId(value));
}
