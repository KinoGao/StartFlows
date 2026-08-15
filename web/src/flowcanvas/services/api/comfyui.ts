import { nanoid } from "nanoid";

import { apiUrl } from "@/flowcanvas/constant/env";
import type { ComfyUiConfig } from "@/flowcanvas/stores/use-config-store";
import type { ComfyWorkflowJson } from "@/flowcanvas/services/comfyui-workflows";
import { durableGenerationHeaders } from "@/flowcanvas/services/api/generation-jobs";

export type ComfyPromptResponse = {
    prompt_id?: string;
    number?: number;
    node_errors?: Record<string, unknown>;
};

export type ComfyHistoryItem = {
    outputs?: Record<string, Record<string, unknown>>;
    status?: { status_str?: string; completed?: boolean; messages?: unknown[] };
};

export type ComfyOutputFile = {
    filename: string;
    subfolder?: string;
    type?: string;
    format?: string;
    mimeType?: string;
    mime_type?: string;
};

type ComfyMediaKind = "image" | "video" | "audio";

export type ComfyTextOutput = {
    nodeId: string;
    title?: string;
    text: string;
};

const COMFY_MEDIA_EXTENSIONS: Record<ComfyMediaKind, Set<string>> = {
    image: new Set(["avif", "bmp", "gif", "jpeg", "jpg", "png", "tif", "tiff", "webp"]),
    video: new Set(["avi", "m4v", "mkv", "mov", "mp4", "mpeg", "mpg", "ogv", "webm", "wmv"]),
    audio: new Set(["aac", "flac", "m4a", "mp3", "oga", "ogg", "opus", "wav", "wave"]),
};

const COMFY_OUTPUT_KEY_HINTS: Record<ComfyMediaKind, Set<string>> = {
    image: new Set(["image", "images"]),
    video: new Set(["animated", "gif", "gifs", "video", "videos"]),
    audio: new Set(["audio", "audios"]),
};

const COMFY_TEXT_OUTPUT_KEY_HINTS = new Set(["caption", "captions", "description", "descriptions", "message", "messages", "output", "outputs", "prompt", "prompts", "result", "results", "string", "strings", "text", "texts"]);

type ComfyRequestOptions = {
    method?: "GET" | "POST";
    body?: unknown;
    signal?: AbortSignal;
    jobId?: string;
};
class ComfyRequestError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
        this.name = "ComfyRequestError";
    }
}

const RETRYABLE_COMFY_STATUSES = new Set([502, 503, 504]);
const MAX_CONSECUTIVE_HISTORY_FAILURES = 8;

export async function testComfyConnection(config: ComfyUiConfig) {
    try {
        return await comfyRequest<Record<string, unknown>>(config, "/system_stats");
    } catch {
        return comfyRequest<Record<string, unknown>>(config, "/object_info");
    }
}

export async function queueComfyPrompt(config: ComfyUiConfig, workflow: ComfyWorkflowJson, signal?: AbortSignal, jobId?: string) {
    const payload = await comfyRequest<ComfyPromptResponse>(config, "/prompt", {
        method: "POST",
        body: {
            prompt: workflow,
            client_id: config.clientId.trim() || `flow-canvas-${nanoid(8)}`,
        },
        signal,
        jobId,
    });
    if (!payload.prompt_id) throw new Error("ComfyUI 没有返回 prompt_id");
    if (payload.node_errors && Object.keys(payload.node_errors).length) throw new Error("ComfyUI 工作流节点校验失败");
    return payload;
}

export async function getComfyHistory(config: ComfyUiConfig, promptId: string, signal?: AbortSignal) {
    return comfyRequest<Record<string, ComfyHistoryItem>>(config, `/history/${encodeURIComponent(promptId)}`, { signal });
}

export async function waitForComfyHistory(config: ComfyUiConfig, promptId: string, signal?: AbortSignal) {
    const timeoutMs = Math.max(10, Number(config.timeoutSeconds) || 300) * 1000;
    const intervalMs = Math.max(500, Number(config.pollIntervalMs) || 1200);
    const startedAt = Date.now();
    let consecutiveFailures = 0;
    while (Date.now() - startedAt < timeoutMs) {
        try {
            const history = await getComfyHistory(config, promptId, signal);
            consecutiveFailures = 0;
            const item = history[promptId];
            if (item?.outputs || item?.status?.completed) return item;
            await sleep(intervalMs, signal);
        } catch (error) {
            if (signal?.aborted || !isRetryableHistoryError(error)) throw error;
            consecutiveFailures += 1;
            if (consecutiveFailures > MAX_CONSECUTIVE_HISTORY_FAILURES) throw error;
            const retryDelay = Math.min(5000, intervalMs * 2 ** Math.min(consecutiveFailures - 1, 3));
            await sleep(retryDelay, signal);
        }
    }
    throw new Error("ComfyUI 任务等待超时");
}

export function extractComfyOutputImages(history: ComfyHistoryItem) {
    return extractComfyOutputFiles(history, "image");
}

export function extractComfyOutputVideos(history: ComfyHistoryItem) {
    return extractComfyOutputFiles(history, "video");
}

export function extractComfyOutputAudios(history: ComfyHistoryItem) {
    return extractComfyOutputFiles(history, "audio");
}

export function extractComfyOutputTexts(history: ComfyHistoryItem, workflow?: ComfyWorkflowJson): ComfyTextOutput[] {
    const workflowOrder = new Map(Object.keys(workflow || {}).map((nodeId, index) => [nodeId, index]));
    const outputs = Object.entries(history.outputs || {}).sort(([left], [right]) => (workflowOrder.get(left) ?? Number.MAX_SAFE_INTEGER) - (workflowOrder.get(right) ?? Number.MAX_SAFE_INTEGER));
    const texts: ComfyTextOutput[] = [];
    const seen = new Set<string>();
    outputs.forEach(([nodeId, output]) => {
        collectComfyOutputStrings(output).forEach((text) => {
            const normalized = text.trim();
            const identity = `${nodeId}\u0000${normalized}`;
            if (!normalized || seen.has(identity)) return;
            seen.add(identity);
            texts.push({ nodeId, title: workflow?.[nodeId]?._meta?.title, text: normalized });
        });
    });
    return texts;
}

export type ComfyUploadResult = {
    name: string;
    subfolder?: string;
    type?: string;
};

export async function uploadComfyFile(config: ComfyUiConfig, blob: Blob, filename: string, signal?: AbortSignal): Promise<ComfyUploadResult> {
    const formData = new FormData();
    formData.append("image", blob, filename);
    let response: Response;
    if (config.proxyMode === "backend") {
        formData.append("baseUrl", normalizeComfyBaseUrl(config.baseUrl));
        response = await fetch(apiUrl("/api/comfyui-proxy"), { method: "POST", headers: durableGenerationHeaders(apiUrl("/api/comfyui-proxy")), body: formData, signal });
    } else {
        const baseUrl = normalizeComfyBaseUrl(config.baseUrl);
        response = await fetch(`${baseUrl}/upload/image`, { method: "POST", body: formData, signal });
    }
    if (!response.ok) throw new ComfyRequestError(await readComfyError(response), response.status);
    return response.json() as Promise<ComfyUploadResult>;
}

export function buildComfyViewUrl(config: ComfyUiConfig, file: ComfyOutputFile) {
    const params = new URLSearchParams({
        filename: file.filename,
        type: file.type || "output",
    });
    if (file.subfolder) params.set("subfolder", file.subfolder);
    const path = `/view?${params}`;
    const proxyParams = new URLSearchParams({ baseUrl: normalizeComfyBaseUrl(config.baseUrl), path });
    return apiUrl(`/api/comfyui-proxy?${proxyParams}`);
}

export async function runComfyWorkflow(config: ComfyUiConfig, workflow: ComfyWorkflowJson, signal?: AbortSignal, jobId?: string) {
    const queued = await queueComfyPrompt(config, workflow, signal, jobId);
    const history = await waitForComfyHistory(config, queued.prompt_id!, signal);
    const images = extractComfyOutputImages(history).map((file) => buildComfyViewUrl(config, file));
    const videos = extractComfyOutputVideos(history).map((file) => buildComfyViewUrl(config, file));
    const audios = extractComfyOutputAudios(history).map((file) => buildComfyViewUrl(config, file));
    const texts = extractComfyOutputTexts(history, workflow);
    return { promptId: queued.prompt_id!, history, images, videos, audios, texts };
}

async function comfyRequest<T>(config: ComfyUiConfig, path: string, options: ComfyRequestOptions = {}): Promise<T> {
    const method = options.method || "GET";
    const baseUrl = normalizeComfyBaseUrl(config.baseUrl);
    const init: RequestInit = {
        method,
        signal: options.signal,
        headers: options.body === undefined ? undefined : { "Content-Type": "application/json" },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    };
    const response =
        config.proxyMode === "backend"
            ? await fetch(apiUrl("/api/comfyui-proxy"), {
                  method: "POST",
                  headers: { "Content-Type": "application/json", ...durableGenerationHeaders(apiUrl("/api/comfyui-proxy"), options.jobId) },
                  body: JSON.stringify({ baseUrl, path, method, body: options.body }),
                  signal: options.signal,
              })
            : await fetch(`${baseUrl}${path}`, init);
    if (!response.ok) throw new ComfyRequestError(await readComfyError(response), response.status);
    return response.json() as Promise<T>;
}
function isRetryableHistoryError(error: unknown) {
    return error instanceof TypeError || (error instanceof ComfyRequestError && RETRYABLE_COMFY_STATUSES.has(error.status));
}

function extractComfyOutputFiles(history: ComfyHistoryItem, kind: ComfyMediaKind) {
    const files: ComfyOutputFile[] = [];
    const seen = new Set<string>();
    Object.values(history.outputs || {}).forEach((output) => {
        Object.entries(output).forEach(([key, value]) => {
            collectComfyOutputFiles(value).forEach((file) => {
                if (detectComfyMediaKind(file, key) !== kind) return;
                const identity = JSON.stringify([file.type || "output", file.subfolder || "", file.filename]);
                if (seen.has(identity)) return;
                seen.add(identity);
                files.push(file);
            });
        });
    });
    return files;
}

function collectComfyOutputFiles(value: unknown): ComfyOutputFile[] {
    if (isComfyOutputFile(value)) return [value];
    if (Array.isArray(value)) return value.flatMap(collectComfyOutputFiles);
    if (!value || typeof value !== "object") return [];
    return Object.values(value).flatMap(collectComfyOutputFiles);
}

function collectComfyOutputStrings(value: unknown, textField = false): string[] {
    if (typeof value === "string") return textField ? [value] : [];
    if (Array.isArray(value)) return value.flatMap((item) => collectComfyOutputStrings(item, textField));
    if (!value || typeof value !== "object" || isComfyOutputFile(value)) return [];
    return Object.entries(value).flatMap(([key, item]) => collectComfyOutputStrings(item, textField || COMFY_TEXT_OUTPUT_KEY_HINTS.has(key.toLowerCase())));
}

function detectComfyMediaKind(file: ComfyOutputFile, outputKey: string): ComfyMediaKind | undefined {
    const extension = file.filename.split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase();
    if (extension) {
        const extensionKind = (Object.keys(COMFY_MEDIA_EXTENSIONS) as ComfyMediaKind[]).find((kind) => COMFY_MEDIA_EXTENSIONS[kind].has(extension));
        if (extensionKind) return extensionKind;
    }

    const format = [file.mimeType, file.mime_type, file.format].find((value) => typeof value === "string")?.toLowerCase();
    if (format) {
        if (format.startsWith("image/") || format.includes("image")) return "image";
        if (format.startsWith("video/") || format.includes("video")) return "video";
        if (format.startsWith("audio/") || format.includes("audio")) return "audio";
    }

    const normalizedKey = outputKey.toLowerCase();
    return (Object.keys(COMFY_OUTPUT_KEY_HINTS) as ComfyMediaKind[]).find((kind) => COMFY_OUTPUT_KEY_HINTS[kind].has(normalizedKey));
}

function isComfyOutputFile(value: unknown): value is ComfyOutputFile {
    return Boolean(value && typeof value === "object" && "filename" in value && typeof (value as ComfyOutputFile).filename === "string");
}

export function normalizeComfyBaseUrl(baseUrl: string) {
    const value = baseUrl.trim().replace(/\/+$/, "");
    return value || "http://127.0.0.1:8188";
}

async function readComfyError(response: Response) {
    const text = await response.text();
    if (!text) return `ComfyUI 请求失败：HTTP ${response.status}`;
    try {
        const payload = JSON.parse(text) as { detail?: string; error?: string };
        return payload.detail || payload.error || `ComfyUI 请求失败：HTTP ${response.status}`;
    } catch {
        return text.slice(0, 300);
    }
}

function sleep(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        const timer = window.setTimeout(resolve, ms);
        signal?.addEventListener(
            "abort",
            () => {
                window.clearTimeout(timer);
                reject(new DOMException("请求已取消", "AbortError"));
            },
            { once: true },
        );
    });
}
