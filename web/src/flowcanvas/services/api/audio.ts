import axios from "axios";

import { audioMimeType, normalizeAudioFormatValue, normalizeAudioSpeedValue, normalizeAudioVoiceValue } from "@/flowcanvas/lib/audio-generation";
import { uploadMediaFile, type UploadedFile } from "@/flowcanvas/services/file-storage";
import { resolveAudioModelCapabilityForRequest } from "@/flowcanvas/services/api/model-capabilities";
import { durableGenerationHeaders, type DurableGenerationOptions } from "@/flowcanvas/services/api/generation-jobs";
import { buildApiUrl, modelOptionName, resolveModelRequestConfig, type AiConfig } from "@/flowcanvas/stores/use-config-store";

type RequestOptions = DurableGenerationOptions;

/** 音频生成请求超时（毫秒） */
const AUDIO_GENERATION_TIMEOUT_MS = 1_800_000;

function aiApiUrl(config: AiConfig, path: string) {
    return buildApiUrl(config.baseUrl, path, config.useProxy);
}

function aiHeaders(config: AiConfig) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
    };
}

const AUDIO_TASK_POLL_INTERVAL_MS = 2000;
const AUDIO_TASK_TIMEOUT_MS = 10 * 60_000;

type AudioTaskRecord = {
    id: string;
    status: "pending" | "running" | "success" | "error" | "cancelled";
    result?: { url?: string; mimeType?: string };
    error?: string | { message?: string };
    needsReview?: boolean;
    reviewReason?: string;
};

/** VOZEB 任务化音频生成：创建任务 + 轮询，返回可播放 URL（服务端执行，页面关闭也继续）。 */
export async function requestAudioGeneration(config: AiConfig, prompt: string, options?: RequestOptions): Promise<{ url: string; mimeType: string }> {
    const model = modelOptionName(config.model || config.audioModel);
    const response = await fetch("/api/audio-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            config: {
                model,
                voice: normalizeAudioVoiceValue(config.audioVoice),
                format: normalizeAudioFormatValue(config.audioFormat),
                speed: Number(normalizeAudioSpeedValue(config.audioSpeed)),
                ...(config.audioInstructions.trim() ? { instructions: config.audioInstructions.trim() } : {}),
            },
            prompt,
            source: "canvas",
        }),
        signal: options?.signal,
    });
    const body = (await response.json()) as { task?: AudioTaskRecord; error?: string };
    if (!response.ok || !body.task?.id) throw new Error(body.error || `音频任务创建失败：${response.status}`);
    const startedAt = Date.now();
    for (;;) {
        if (options?.signal?.aborted) throw new DOMException("Aborted", "AbortError");
        const poll = await (await fetch(`/api/audio-tasks/${encodeURIComponent(body.task.id)}`, { signal: options?.signal })).json() as { task?: AudioTaskRecord; error?: string };
        const record = poll.task;
        if (!record) throw new Error(poll.error || "音频任务查询失败");
        if (record.status === "success") {
            const url = record.result?.url || "";
            if (!url) throw new Error("音频接口没有返回内容");
            return { url: new URL(url, window.location.origin).toString(), mimeType: record.result?.mimeType || "audio/mpeg" };
        }
        if (record.status === "error") throw new Error(typeof record.error === "string" ? record.error : record.error?.message || "音频生成失败");
        if (record.status === "cancelled") throw new Error("音频任务已取消");
        if (record.needsReview) throw new Error(record.reviewReason || "音频结果需要人工复核");
        if (Date.now() - startedAt > AUDIO_TASK_TIMEOUT_MS) throw new Error("音频生成超时");
        await new Promise((resolve) => setTimeout(resolve, AUDIO_TASK_POLL_INTERVAL_MS));
    }
}

export async function storeGeneratedAudio(result: Blob | { url: string; mimeType?: string }, format = "mp3"): Promise<UploadedFile> {
    if (result instanceof Blob) {
        const audio = result.type.startsWith("audio/") ? result : new Blob([result], { type: audioMimeType(format) });
        return uploadMediaFile(audio, "audio");
    }
    return uploadMediaFile(result.url, "audio");
}

function assertAudioConfig(config: AiConfig, model: string) {
    if (!model) throw new Error("请先配置音频模型");
    if (!config.baseUrl.trim()) throw new Error("请先配置 Base URL");
    if (!config.apiKey.trim()) throw new Error("请先配置 API Key");
    if (config.apiFormat === "gemini") throw new Error("Gemini 调用格式暂不支持音频生成，请使用 OpenAI 格式渠道");
}

function assertAudioCapability(capability: Awaited<ReturnType<typeof resolveAudioModelCapabilityForRequest>>, config: AiConfig) {
    if (!capability) return;
    const voice = normalizeAudioVoiceValue(config.audioVoice);
    const format = normalizeAudioFormatValue(config.audioFormat);
    const speed = Number(normalizeAudioSpeedValue(config.audioSpeed));
    if (capability.voices.length && !capability.voices.includes(voice)) throw new Error(`当前模型不支持音色 ${voice}`);
    if (capability.formats.length && !capability.formats.includes(format)) throw new Error(`当前模型不支持输出格式 ${format}`);
    if (capability.speeds.length && !capability.speeds.some((value) => Math.abs(value - speed) < 0.0001)) throw new Error(`当前模型不支持语速 ${speed}`);
    if (config.audioInstructions.trim() && !capability.instructions) throw new Error("当前模型不支持语音指令");
}

async function assertAudioBlob(blob: Blob) {
    if (!blob.type.includes("json")) return;
    let payload: { code?: number; msg?: string; error?: { message?: string } };
    try {
        payload = JSON.parse(await blob.text()) as { code?: number; msg?: string; error?: { message?: string } };
    } catch {
        return;
    }
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || "音频生成失败");
    if (payload.error?.message) throw new Error(payload.error.message);
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return "请求已取消";
    if (axios.isAxiosError<{ error?: { message?: string }; msg?: string; code?: number }>(error)) {
        if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") return "请求超时，请检查网络或稍后重试";
        const responseData = error.response?.data;
        return responseData?.msg || normalizeUpstreamMessage(responseData?.error?.message) || statusMessage(error.response?.status, fallback);
    }
    return error instanceof Error ? error.message : fallback;
}

function normalizeUpstreamMessage(message: string | undefined): string | undefined {
    if (!message) return undefined;
    if (/ServiceUnavailable|Service busy|Service Unavailable/i.test(message)) return "上游服务繁忙，请稍后重试";
    if (/Rate limit|Too Many Requests|rate limit/i.test(message)) return "请求被限流，请稍后重试";
    if (/Insufficient (quota|balance|credits)/i.test(message)) return "账户余额不足，请充值后重试";
    if (/Invalid API [Kk]ey|authentication|Unauthorized/i.test(message)) return "鉴权失败，请检查 API Key";
    if (/Model not exist|model not found|does not exist/i.test(message)) return "模型不可用，请检查模型名称或权限";
    const trimmed = message.length > 200 ? `${message.slice(0, 200)}…` : message;
    return trimmed;
}

function statusMessage(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    if (status === 503) return "上游服务繁忙，请稍后重试";
    if (status === 502 || status === 504) return "上游网关异常，请稍后重试";
    return status ? `${fallback}（${status}）` : fallback;
}
