import type { SystemModelChannel } from "@/lib/auth/store";
import { recordChannelRuntimeFailure, recordChannelRuntimeSuccess } from "@/lib/server/channel-runtime-health";
import { fetchInternalApi } from "@/lib/server/internal-origin";
import { resolveModelRequestTimeoutMs } from "@/lib/server/model-request-policy";
import { buildProviderRequest, isProviderBusinessError, readProviderError, readProviderString } from "@/lib/server/provider-task-config";
import { strictJsonObjectText } from "@/lib/server/structured-model-output";
import { resolveTextProtocol } from "@/lib/server/text-protocol-resolver";

export type TextPlanningProtocol = "responses" | "chat" | "gemini" | "custom";
export type TextPlanningCandidate = {
    channelId: string;
    upstreamModel: string;
    channel: SystemModelChannel;
    capabilityProfile?: { timeoutMs?: number };
};
export type TextPlanningTool = { name: string; description: string; parameters: Record<string, unknown> };
export type TextPlanningCall = { arguments: string; headers: Headers; protocol: TextPlanningProtocol; elapsedMs: number };

type RuntimeState = {
    preferred?: TextPlanningProtocol;
    consecutiveFailures: number;
    cooldownUntil?: number;
    successCount: number;
    failureCount: number;
    averageLatencyMs?: number;
    lastFailureAt?: number;
    lastSuccessAt?: number;
};

export type StructuredTextRequest = {
    origin: string;
    cookie: string;
    candidate: TextPlanningCandidate;
    messages: Array<{ role: string; content: string }>;
    tool: TextPlanningTool;
    headers?: HeadersInit;
    signal?: AbortSignal;
    allowNaturalLanguage?: boolean;
    onInvalidResponse?: (headers: Headers) => Promise<unknown>;
};

type ProtocolRequest = {
    protocol: TextPlanningProtocol;
    path: string;
    body: Record<string, unknown>;
    resultField?: string;
};

const FAILURE_COOLDOWN_MS = 30_000;
const TEXT_RESULT_KEYS = ["output_text", "text", "content", "response", "result"];
const states = new Map<string, RuntimeState>();

export class TextPlanningRequestError extends Error {
    constructor(
        message: string,
        readonly status = 502,
        readonly retryable = status >= 500 || status === 408 || status === 429,
    ) {
        super(message);
        this.name = "TextPlanningRequestError";
    }
}

export function rankTextPlanningCandidates<T extends TextPlanningCandidate>(candidates: T[], now = Date.now()) {
    return candidates
        .map((candidate, index) => ({ candidate, index, state: states.get(runtimeKey(candidate)) }))
        .sort((left, right) => candidateScore(left.state, now) - candidateScore(right.state, now) || left.index - right.index)
        .map(({ candidate }) => candidate);
}

export function preferredTextPlanningProtocol(candidate: TextPlanningCandidate): TextPlanningProtocol {
    return planningProtocolRequest(candidate, []).protocol;
}

export async function requestStructuredText(input: StructuredTextRequest): Promise<TextPlanningCall> {
    const startedAt = Date.now();
    const request = planningProtocolRequest(input.candidate, planningMessages(input));
    try {
        const response = await requestTextProtocol(input, request);
        return await readStructuredResponse(input, request, response, startedAt);
    } catch (error) {
        recordTextFailure(input.candidate, error);
        throw error;
    }
}

export function getTextPlanningRuntime(candidate: TextPlanningCandidate) {
    const current = states.get(runtimeKey(candidate));
    return current ? { ...current } : undefined;
}

export function resetTextPlanningRuntime() {
    states.clear();
}

function planningProtocolRequest(candidate: TextPlanningCandidate, messages: Array<{ role: string; content: string }>): ProtocolRequest {
    const resolved = resolveTextProtocol({
        model: candidate.upstreamModel,
        apiFormat: candidate.channel.apiFormat,
        advancedConfig: candidate.channel.advancedConfig,
        throughSystemProxy: true,
    });
    if (resolved.kind === "responses") return responsesRequest(candidate.upstreamModel, messages, resolved.path);
    if (resolved.kind === "gemini") return geminiRequest(candidate.upstreamModel, resolved.path, messages);
    if (resolved.kind === "custom") return customRequest(candidate.upstreamModel, resolved.path, resolved.requestTemplate!, resolved.resultField!, messages);
    return chatRequest(candidate.upstreamModel, messages, resolved.path);
}

function chatRequest(model: string, messages: Array<{ role: string; content: string }>, path = "/chat/completions"): ProtocolRequest {
    return { protocol: "chat", path, body: { model, messages } };
}

function responsesRequest(model: string, messages: Array<{ role: string; content: string }>, path = "/responses"): ProtocolRequest {
    return { protocol: "responses", path, body: { model, input: messages } };
}

function geminiRequest(model: string, configuredPath: string, messages: Array<{ role: string; content: string }>): ProtocolRequest {
    const systemText = messages
        .filter((message) => message.role === "system")
        .map((message) => message.content)
        .join("\n\n");
    const path = configuredPath || `/models/${encodeURIComponent(model.replace(/^models\//, ""))}:generateContent`;
    return {
        protocol: "gemini",
        path,
        body: {
            contents: messages.filter((message) => message.role !== "system").map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
            ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
        },
    };
}

function customRequest(model: string, configuredPath: string, requestTemplate: string, resultField: string, messages: Array<{ role: string; content: string }>): ProtocolRequest {
    const prompt = messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
    const values = { model, messages, prompt, input: prompt, text: prompt };
    return { protocol: "custom", path: configuredPath, body: buildProviderRequest(requestTemplate, values, values), resultField };
}

async function requestTextProtocol(input: StructuredTextRequest, request: ProtocolRequest) {
    const base = `${input.origin}/api/ai/system/${encodeURIComponent(input.candidate.channelId)}`;
    const headers = new Headers(input.headers);
    headers.set("content-type", "application/json");
    if (input.cookie) headers.set("cookie", input.cookie);
    scopeProtocolIdempotency(headers, request.protocol);
    const timeoutSignal = AbortSignal.timeout(resolveModelRequestTimeoutMs(input.candidate, "text"));
    const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal;
    try {
        return await fetchInternalApi(`${base}${normalizePath(request.path)}`, { method: "POST", headers, body: JSON.stringify(request.body), cache: "no-store", signal });
    } catch (error) {
        if (input.signal?.aborted) throw error;
        throw new TextPlanningRequestError(isTimeoutError(error) ? "文本模型规划响应超时，正在切换备用渠道" : "文本模型渠道暂时无法连接", 504);
    }
}

function scopeProtocolIdempotency(headers: Headers, protocol: TextPlanningProtocol) {
    for (const name of ["idempotency-key", "x-client-request-id"]) {
        const value = headers.get(name)?.trim();
        if (value) headers.set(name, `${value}:${protocol}-json`);
    }
}

async function readStructuredResponse(input: StructuredTextRequest, request: ProtocolRequest, response: Response, startedAt: number): Promise<TextPlanningCall> {
    if (!response.ok) {
        const raw = await response.text();
        throw new TextPlanningRequestError(safeUpstreamError(raw, response.status), response.status, retryableStatus(response.status));
    }
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!payload) throw new TextPlanningRequestError("文本模型返回了无效 JSON");
    if (request.protocol === "custom" && isProviderBusinessError(payload)) throw new TextPlanningRequestError(readProviderError(payload) || "自定义文本协议返回失败");
    const argumentsText = readProtocolArguments(payload, input.tool.name, request, input.allowNaturalLanguage);
    if (!argumentsText) {
        await input.onInvalidResponse?.(response.headers);
        throw new TextPlanningRequestError("模型没有返回所需的结构化结果", 502, false);
    }
    const elapsedMs = Date.now() - startedAt;
    recordTextSuccess(input.candidate, request.protocol, elapsedMs);
    return { arguments: argumentsText, headers: response.headers, protocol: request.protocol, elapsedMs };
}

function readProtocolArguments(payload: Record<string, unknown>, toolName: string, request: ProtocolRequest, allowNaturalLanguage = false) {
    if (request.protocol === "responses") return responsesArguments(payload, toolName, allowNaturalLanguage);
    if (request.protocol === "gemini") return geminiArguments(payload, toolName, allowNaturalLanguage);
    if (request.protocol === "custom") {
        const content = readProviderString(payload, request.resultField, TEXT_RESULT_KEYS);
        return strictJsonObjectText(content) || (allowNaturalLanguage ? content : "");
    }
    return chatArguments(payload, toolName, allowNaturalLanguage);
}

function planningMessages(input: StructuredTextRequest) {
    const instruction = `请先在模型内部完成需求理解、约束分析、模型选择、任务拆分与依赖规划，再只返回一个严格 JSON 对象，作为 ${input.tool.name} 的最终参数。任务用途：${input.tool.description}。不要使用 Markdown、代码围栏、解释或额外文字。JSON 必须符合以下 Schema：${JSON.stringify(input.tool.parameters)}`;
    if (input.messages[0]?.role === "system") return [{ ...input.messages[0], content: `${instruction}\n\n${input.messages[0].content}` }, ...input.messages.slice(1)];
    return [{ role: "system", content: instruction }, ...input.messages];
}

function chatArguments(payload: Record<string, unknown>, toolName: string, allowNaturalLanguage: boolean) {
    const message = firstRecord(payload.choices)?.message as Record<string, unknown> | undefined;
    const call = records(message?.tool_calls).find((item) => record(item.function)?.name === toolName);
    const argumentsText = record(call?.function)?.arguments;
    if (typeof argumentsText === "string" && argumentsText.trim()) return argumentsText.trim();
    const content = typeof message?.content === "string" ? message.content.trim() : "";
    if (content) return strictJsonObjectText(content) || (allowNaturalLanguage ? content : "");
    // Some compatible gateways wrap a Chat result as a Responses payload.
    return responsesArguments(payload, toolName, allowNaturalLanguage);
}

function responsesArguments(payload: Record<string, unknown>, toolName: string, allowNaturalLanguage: boolean) {
    const output = records(payload.output);
    const call = output.find((item) => item.type === "function_call" && item.name === toolName);
    if (typeof call?.arguments === "string" && call.arguments.trim()) return call.arguments.trim();
    const direct = typeof payload.output_text === "string" ? payload.output_text.trim() : "";
    const content =
        direct ||
        output
            .flatMap((item) => records(item.content))
            .map((item) => (typeof item.text === "string" ? item.text : ""))
            .join("")
            .trim();
    return strictJsonObjectText(content) || (allowNaturalLanguage ? content : "");
}

function geminiArguments(payload: Record<string, unknown>, toolName: string, allowNaturalLanguage: boolean) {
    const parts = records(record(firstRecord(payload.candidates)?.content)?.parts);
    const call = parts.map((part) => record(part.functionCall)).find((item) => item?.name === toolName);
    if (call?.args && typeof call.args === "object") return JSON.stringify(call.args);
    const content = parts
        .map((part) => (typeof part.text === "string" ? part.text : ""))
        .join("")
        .trim();
    return strictJsonObjectText(content) || (allowNaturalLanguage ? content : "");
}

function candidateScore(state: RuntimeState | undefined, now: number) {
    if (!state) return 10_000;
    if ((state.cooldownUntil || 0) > now) return 1_000_000 + (state.cooldownUntil || 0) - now;
    const total = state.successCount + state.failureCount;
    return (total ? state.failureCount / total : 0) * 100_000 + (state.averageLatencyMs || 10_000);
}

function recordTextSuccess(candidate: TextPlanningCandidate, protocol: TextPlanningProtocol, elapsedMs: number) {
    const key = runtimeKey(candidate);
    const current = states.get(key) || emptyState();
    states.set(key, {
        ...current,
        preferred: protocol,
        consecutiveFailures: 0,
        cooldownUntil: undefined,
        successCount: current.successCount + 1,
        averageLatencyMs: current.averageLatencyMs === undefined ? elapsedMs : Math.round(current.averageLatencyMs * 0.7 + elapsedMs * 0.3),
        lastSuccessAt: Date.now(),
    });
    recordChannelRuntimeSuccess(candidate.channelId, "text");
}

function recordTextFailure(candidate: TextPlanningCandidate, error: unknown) {
    const key = runtimeKey(candidate);
    const current = states.get(key) || emptyState();
    const consecutiveFailures = current.consecutiveFailures + 1;
    states.set(key, { ...current, consecutiveFailures, failureCount: current.failureCount + 1, cooldownUntil: Date.now() + FAILURE_COOLDOWN_MS * Math.min(4, consecutiveFailures), lastFailureAt: Date.now() });
    recordChannelRuntimeFailure(candidate.channelId, "text", error instanceof Error ? error.message : String(error || "文本规划失败"));
}

function emptyState(): RuntimeState {
    return { consecutiveFailures: 0, successCount: 0, failureCount: 0 };
}

function runtimeKey(candidate: TextPlanningCandidate) {
    return `${candidate.channelId}:${candidate.upstreamModel.toLowerCase()}`;
}

function safeUpstreamError(value: string, status: number) {
    const fallback = status === 401 || status === 403 ? "文本模型渠道鉴权失败，请管理员检查密钥" : status === 429 ? "文本模型渠道请求过于频繁，请稍后重试" : status >= 500 ? `文本模型渠道暂不可用（HTTP ${status}）` : "文本模型调用失败";
    if (!value.trim() || /<!doctype\s+html|<html\b|<title>|<body\b|\bnginx\b|\bcloudflare\b/i.test(value)) return fallback;
    try {
        const payload = JSON.parse(value) as { msg?: unknown; error?: unknown };
        const error = payload.error && typeof payload.error === "object" ? (payload.error as { message?: unknown }) : undefined;
        return (
            [payload.msg, typeof payload.error === "string" ? payload.error : undefined, error?.message]
                .find((item): item is string => typeof item === "string" && Boolean(item.trim()))
                ?.trim()
                .slice(0, 300) || fallback
        );
    } catch {
        return value.trim().slice(0, 300) || fallback;
    }
}

function normalizePath(value: string) {
    return `/${value.trim().replace(/^\/+/, "")}`;
}

function records(value: unknown): Record<string, unknown>[] {
    return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function firstRecord(value: unknown) {
    return records(value)[0];
}

function retryableStatus(status: number) {
    return status === 408 || status === 425 || status === 429 || status >= 500;
}

function isTimeoutError(error: unknown) {
    return error instanceof Error && (error.name === "TimeoutError" || /timeout|timed out/i.test(error.message));
}
