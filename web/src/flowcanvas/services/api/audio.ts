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

export async function requestAudioGeneration(config: AiConfig, prompt: string, options?: RequestOptions): Promise<Blob> {
    const selectedModel = config.model || config.audioModel;
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    const model = requestConfig.model.trim();
    assertAudioConfig(requestConfig, model);
    assertAudioCapability(await resolveAudioModelCapabilityForRequest(modelOptionName(selectedModel)), requestConfig);
    const format = normalizeAudioFormatValue(config.audioFormat);
    const instructions = config.audioInstructions.trim();

    const url = aiApiUrl(requestConfig, "/audio/speech");
    try {
        const response = await axios.post<Blob>(
            url,
            {
                model,
                input: prompt,
                voice: normalizeAudioVoiceValue(config.audioVoice),
                response_format: format,
                speed: Number(normalizeAudioSpeedValue(config.audioSpeed)),
                ...(instructions ? { instructions } : {}),
            },
            { headers: { ...aiHeaders(requestConfig), ...durableGenerationHeaders(url, options?.jobId) }, responseType: "blob", signal: options?.signal, timeout: AUDIO_GENERATION_TIMEOUT_MS },
        );
        await assertAudioBlob(response.data);
        return response.data.type.startsWith("audio/") ? response.data : new Blob([response.data], { type: audioMimeType(format) });
    } catch (error) {
        throw new Error(readAxiosError(error, "音频生成失败"));
    }
}

export async function storeGeneratedAudio(blob: Blob, format = "mp3"): Promise<UploadedFile> {
    const audio = blob.type.startsWith("audio/") ? blob : new Blob([blob], { type: audioMimeType(format) });
    return uploadMediaFile(audio, "audio");
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
