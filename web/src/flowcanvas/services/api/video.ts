import axios from "axios";
import { apiUrl } from "@/flowcanvas/constant/env";

import { uploadMediaFile, type UploadedFile } from "@/flowcanvas/services/file-storage";
import { imageToDataUrl, imageToFile } from "@/flowcanvas/services/image-storage";
import { dataUrlToBlob } from "@/flowcanvas/lib/image-utils";
import {
    boolConfig,
    isAgnesVideoConfig,
    normalizeResolutionToken,
    normalizeSeedanceRatio,
} from "@/flowcanvas/lib/seedance-video";
import { buildApiUrl, modelOptionName, resolveModelRequestConfig, useConfigStore, type AiConfig } from "@/flowcanvas/stores/use-config-store";
import { uploadImageToCurrentBackend } from "@/flowcanvas/services/api/backend";
import { useUserStore } from "@/flowcanvas/stores/use-user-store";
import { rewriteThroughProxy } from "@/flowcanvas/lib/ai-proxy-url";
import type { ReferenceImage } from "@/flowcanvas/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/flowcanvas/types/media";
import { resolveVideoModelCapabilityForRequest, type VideoGenerationMode, type VideoModelCapability } from "@/flowcanvas/services/api/model-capabilities";
import { VideoGenerationTimeoutError, assertVideoGenerationActive, remainingVideoGenerationTime } from "@/flowcanvas/services/api/video-generation-timeout";
import { durableGenerationHeaders, type DurableGenerationOptions } from "@/flowcanvas/services/api/generation-jobs";

type VideoResponse = { id: string; status?: string; error?: { message?: string } };
type ApiEnvelope<T> = T | { code?: number; data?: T | null; msg?: string };
type ApiVideoResponse = ApiEnvelope<VideoResponse>;
type AgnesTask = {
    id?: string;
    task_id?: string;
    video_id?: string;
    object?: string;
    status?: "queued" | "in_progress" | "completed" | "failed" | string;
    progress?: number;
    seconds?: string | number;
    size?: string;
    remixed_from_video_id?: string | null;
    video_url?: string | null;
    url?: string | null;
    error?: { message?: string; code?: string | number } | null;
    message?: string;
};
type RequestOptions = DurableGenerationOptions & { generationMode?: VideoGenerationMode; onDownloadStart?: () => void };

/** 创建接口只负责返回任务 ID，生成过程由后续轮询负责。 */
const VIDEO_CREATE_TIMEOUT_MS = 90_000;
/** Agnes 创建时会拉取公网参考图，保留相同的 90 秒网络窗口。 */
const AGNES_VIDEO_CREATE_TIMEOUT_MS = 90_000;
/** 视频轮询单次请求超时（毫秒） */
const VIDEO_POLL_TIMEOUT_MS = 60_000;
/** 视频文件下载超时（毫秒）：Junli 等上游 CDN 下载速度慢，15 秒 720p 视频可能需数分钟，放宽到 10 分钟。 */
const VIDEO_DOWNLOAD_TIMEOUT_MS = 10 * 60_000;

export type VideoGenerationResult = { blob?: Blob; url?: string; mimeType?: string };
export type VideoGenerationTask = { id: string; provider: "openai" | "agnes"; model: string };
export type VideoGenerationTaskState = { status: "pending" } | { status: "completed"; result: VideoGenerationResult } | { status: "failed"; error: string };

function aiApiUrl(config: AiConfig, path: string) {
    return buildApiUrl(config.baseUrl, path, config.useProxy);
}

function aiHeaders(config: AiConfig, contentType?: string) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

export async function requestVideoGeneration(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], options?: RequestOptions): Promise<VideoGenerationResult> {
    const startedAt = Date.now();
    const task = await createVideoGenerationTask(config, prompt, references, videoReferences, audioReferences, options);
    return waitForVideoGenerationTask(config, task, { ...options, startedAt });
}

export async function waitForVideoGenerationTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions & { startedAt?: number }): Promise<VideoGenerationResult> {
    const startedAt = options?.startedAt ?? Date.now();
    if (options?.signal?.aborted) throw abortError();

    const controller = new AbortController();
    let deadlineExpired = false;
    const abortFromParent = () => controller.abort();
    options?.signal?.addEventListener("abort", abortFromParent, { once: true });
    const pollOptions: RequestOptions = { signal: controller.signal, generationMode: options?.generationMode };
    const pollDelayMs = task.provider === "openai" ? 2500 : 5000;
    const remainingAtStart = remainingVideoGenerationTime(startedAt);
    const deadlineTimer = remainingAtStart > 0
        ? setTimeout(() => {
              deadlineExpired = true;
              controller.abort();
          }, remainingAtStart)
        : null;

    try {
        // A canvas can reopen after the 30-minute local deadline while the provider task
        // has already completed. Poll once before enforcing the timeout so that result can
        // still be restored instead of being discarded solely because the page was closed.
        const initialState = await pollVideoGenerationTask(config, task, pollOptions);
        if (initialState.status === "completed") return initialState.result;
        if (initialState.status === "failed") throw new Error(initialState.error);
        if (remainingAtStart <= 0) throw new VideoGenerationTimeoutError();

        while (true) {
            assertVideoGenerationActive(startedAt);
            const state = await pollVideoGenerationTask(config, task, pollOptions);
            assertVideoGenerationActive(startedAt);
            if (state.status === "completed") return state.result;
            if (state.status === "failed") throw new Error(state.error);
            await delay(Math.min(pollDelayMs, remainingVideoGenerationTime(startedAt)), controller.signal);
        }
    } catch (error) {
        if (error instanceof VideoGenerationTimeoutError || deadlineExpired) throw new VideoGenerationTimeoutError();
        if (options?.signal?.aborted) throw abortError();
        throw error;
    } finally {
        if (deadlineTimer) clearTimeout(deadlineTimer);
        options?.signal?.removeEventListener("abort", abortFromParent);
    }
}

export async function createVideoGenerationTask(config: AiConfig, prompt: string, references: ReferenceImage[] = [], videoReferences: ReferenceVideo[] = [], audioReferences: ReferenceAudio[] = [], options?: RequestOptions): Promise<VideoGenerationTask> {
    // VOZEB 任务化视频生成：创建任务 + 轮询，服务端执行（页面关闭也继续）
    const selectedModel = (config.model || config.videoModel).trim();
    const model = modelOptionName(selectedModel);
    const referenceUrl = (item: { dataUrl?: string; url?: string }) => (item.dataUrl?.startsWith("data:") ? item.dataUrl : item.url || item.dataUrl || "");
    const referencesPayload = [
        ...references.map((item) => ({ type: "image", role: "reference", url: referenceUrl(item) })),
        ...videoReferences.map((item) => ({ type: "video", role: "reference", url: referenceUrl(item) })),
        ...audioReferences.map((item) => ({ type: "audio", role: "reference", url: referenceUrl(item) })),
    ].filter((item) => item.url);
    const response = await fetch(apiUrl("/api/video-generation-tasks"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            config: {
                model,
                ...(config.size ? { size: config.size } : {}),
                ...(config.vquality ? { vquality: config.vquality } : {}),
                ...(config.videoSeconds ? { videoSeconds: config.videoSeconds } : {}),
                ...(config.videoGenerateAudio ? { videoGenerateAudio: config.videoGenerateAudio } : {}),
                ...(config.videoWatermark ? { videoWatermark: config.videoWatermark } : {}),
            },
            prompt,
            references: referencesPayload.length ? referencesPayload : undefined,
            source: "canvas",
        }),
        signal: options?.signal,
    });
    const body = (await response.json()) as { task?: { id?: string }; error?: string };
    if (!response.ok || !body.task?.id) throw new Error(body.error || `视频任务创建失败：${response.status}`);
    return { id: body.task.id, provider: "openai", model: selectedModel };
}

function resolveGenerationMode(requested: VideoGenerationMode | undefined, capability: VideoModelCapability | null, images: ReferenceImage[], videos: ReferenceVideo[], audios: ReferenceAudio[]): VideoGenerationMode {
    const inferred: VideoGenerationMode = videos.length || audios.length
        ? "all-in-one-reference"
        : images.length > 2
            ? "multi-frame"
            : images.length === 2
                ? "first-last-frame"
                : images.length === 1
                    ? "image-to-video"
                    : "text-to-video";
    const selected = requested || inferred;
    if (!capability) return selected;
    if (!capability.modes.length) throw new Error("当前视频模型尚未配置任何生成模式，请联系管理员完善模型能力");
    if (!capability.modes.includes(selected)) {
        throw new Error(`当前模型不支持${videoModeLabel(selected)}，支持的模式：${capability.modes.map(videoModeLabel).join("、")}`);
    }
    return selected;
}

function videoModeLabel(mode: VideoGenerationMode) {
    if (mode === "image-to-video") return "首帧图生视频";
    if (mode === "first-last-frame") return "首尾帧图生视频";
    return ({
        "text-to-video": "文生视频",
        "image-to-video": "图生视频",
        "first-last-frame": "首尾帧",
        "image-reference": "图片参考",
        "all-in-one-reference": "全能参考",
        "multi-frame": "智能多帧",
    } satisfies Record<VideoGenerationMode, string>)[mode];
}

function selectVideoReferences(mode: VideoGenerationMode, images: ReferenceImage[], videos: ReferenceVideo[], audios: ReferenceAudio[], capability: VideoModelCapability | null) {
    if (mode === "text-to-video") return { images: [], videos: [], audios: [] };
    if (mode === "image-to-video") {
        if (!images.length) throw new Error("图生视频需要连接 1 张参考图片");
        return { images: images.slice(0, 1), videos: [], audios: [] };
    }
    if (mode === "first-last-frame") {
        if (images.length < 2) throw new Error("首尾帧视频需要按顺序连接首帧和尾帧两张图片");
        return { images: images.slice(0, 2), videos: [], audios: [] };
    }
    if (mode === "image-reference") {
        if (!images.length) throw new Error("图片参考模式至少需要连接 1 张参考图片");
        return { images: boundedReferences("图片", images, capability?.maxImages), videos: [], audios: [] };
    }
    if (mode === "multi-frame") {
        if (images.length < 3) throw new Error("智能多帧至少需要按顺序连接 3 张参考图片");
        return { images: boundedReferences("图片", images, capability?.maxImages), videos: [], audios: [] };
    }
    const selected = {
        images: boundedReferences("图片", images, capability?.maxImages),
        videos: boundedReferences("视频", videos, capability?.maxVideos),
        audios: boundedReferences("音频", audios, capability?.maxAudios),
    };
    if (!selected.images.length && !selected.videos.length && !selected.audios.length) throw new Error("全能参考模式至少需要连接一项图片、视频或音频素材");
    if (selected.audios.length && !selected.images.length && !selected.videos.length) throw new Error("参考音频不能单独使用，请同时连接参考图片或视频");
    return selected;
}

function boundedReferences<T>(label: string, values: T[], max: number | undefined) {
    if (typeof max === "number" && values.length > max) throw new Error(`当前模型最多支持 ${max} 个参考${label}`);
    return values;
}

type VideoTaskRecord = {
    id: string;
    status: "pending" | "running" | "success" | "error" | "cancelled";
    result?: { url?: string; remoteUrl?: string; mimeType?: string; durationMs?: number };
    error?: string | { message?: string };
    needsReview?: boolean;
    reviewReason?: string;
};

function absoluteTaskMediaUrl(url: string) {
    if (/^https?:\/\//i.test(url)) return url;
    if (typeof window === "undefined") return url;
    return new URL(url, window.location.origin).toString();
}

export async function pollVideoGenerationTask(_config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    const response = await fetch(apiUrl(`/api/video-tasks/${encodeURIComponent(task.id)}`), { signal: options?.signal });
    const body = (await response.json()) as { task?: VideoTaskRecord; error?: string };
    const record = body.task;
    if (!record) throw new Error(body.error || `视频任务查询失败：${response.status}`);
    if (record.status === "success") {
        const url = record.result?.url || record.result?.remoteUrl || "";
        if (!url) throw new Error("视频接口没有返回可播放的视频");
        return { status: "completed", result: { url: absoluteTaskMediaUrl(url), mimeType: record.result?.mimeType || "video/mp4" } };
    }
    if (record.status === "error") return { status: "failed", error: typeof record.error === "string" ? record.error : record.error?.message || "视频生成失败" };
    if (record.status === "cancelled") return { status: "failed", error: "视频任务已取消" };
    if (record.needsReview) return { status: "failed", error: record.reviewReason || "视频结果需要人工复核" };
    return { status: "pending" };
}

export async function storeGeneratedVideo(result: VideoGenerationResult): Promise<UploadedFile> {
    if (result.blob) return uploadMediaFile(result.blob, "video");
    if (result.url) return uploadMediaFile(result.url, "video");
    throw new Error("视频接口没有返回可播放的视频");
}

async function createOpenAIVideoTask(config: AiConfig, model: string, prompt: string, references: ReferenceImage[], generationMode: VideoGenerationMode, options?: RequestOptions): Promise<VideoGenerationTask> {
    const body = new FormData();
    body.append("model", modelOptionName(model));
    body.append("prompt", prompt);
    body.append("_flowcanvas_mode", generationMode);
    body.append("seconds", normalizeVideoSeconds(config.videoSeconds));
    if (normalizeVideoSize(config.size)) body.append("size", normalizeVideoSize(config.size)!);
    body.append("resolution_name", normalizeVideoResolution(config.vquality));
    body.append("preset", "normal");
    const files = await Promise.all(references.slice(0, 7).map(imageToFile));
    files.forEach((file) => body.append("input_reference[]", file));
    try {
        const url = aiApiUrl(config, "/videos");
        const created = unwrapVideoResponse((await axios.post<ApiVideoResponse>(url, body, { headers: { ...aiHeaders(config), ...durableGenerationHeaders(url, options?.jobId) }, signal: options?.signal, timeout: VIDEO_CREATE_TIMEOUT_MS })).data);
        if (!created.id) throw new Error("视频接口没有返回任务 ID");
        return { id: created.id, provider: "openai", model };
    } catch (error) {
        throw new Error(readAxiosError(error, "视频任务创建失败"));
    }
}

async function pollOpenAIVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const video = unwrapVideoResponse((await axios.get<ApiVideoResponse>(aiApiUrl(config, `/videos/${task.id}`), { headers: aiHeaders(config), signal: options?.signal, timeout: VIDEO_POLL_TIMEOUT_MS })).data);
        if (video.status === "completed") {
            options?.onDownloadStart?.();
            const content = await axios.get<Blob>(aiApiUrl(config, `/videos/${task.id}/content`), { headers: aiHeaders(config), responseType: "blob", signal: options?.signal, timeout: VIDEO_DOWNLOAD_TIMEOUT_MS });
            await assertVideoBlob(content.data);
            return { status: "completed", result: { blob: content.data } };
        }
        if (video.status === "failed" || video.status === "cancelled") return { status: "failed", error: video.error?.message || "视频生成失败" };
        return { status: "pending" };
    } catch (error) {
        throw new Error(readAxiosError(error, "视频任务查询失败"));
    }
}

// ===== Agnes 视频 V2.0 实现 =====
// 官方文档：POST /v1/videos 使用 application/json，图片参考只接受公网 URL；
// 轮询 GET /agnesapi?video_id=...&model_name=...，视频下载 URL 在响应根字段 `remixed_from_video_id`。
function agnesVideoCreateUrl(config: AiConfig) {
    return buildApiUrl(config.baseUrl, "/videos", config.useProxy);
}

function agnesVideoPollUrl(config: AiConfig, task: VideoGenerationTask) {
    const params = new URLSearchParams();
    params.set("video_id", task.id);
    if (task.model) params.set("model_name", task.model);
    // 轮询端点是 /agnesapi（不在 /v1 命名空间下），而创建端点 /v1/videos 在 /v1 下。
    // 这里不能走 buildApiUrl，否则 baseUrl 不带 /v1 时会被自动补成 /v1/agnesapi。
    return rewriteThroughProxy(`${agnesPollBaseUrl(config.baseUrl)}/agnesapi?${params.toString()}`, config.useProxy);
}

function agnesPollBaseUrl(baseUrl: string) {
    const normalized = baseUrl.trim().replace(/\/+$/, "");
    try {
        const url = new URL(normalized);
        const path = url.pathname.replace(/\/+$/, "").replace(/\/v1$/i, "");
        url.pathname = path || "/";
        url.search = "";
        url.hash = "";
        return url.toString().replace(/\/+$/, "");
    } catch {
        return normalized.replace(/\/v1$/i, "");
    }
}


function agnesReferenceImageUrl(image: ReferenceImage) {
    const directUrl = image.url || image.dataUrl;
    if (isPublicMediaUrl(directUrl)) return directUrl;
    return "";
}

async function createAgnesVideoTask(
    config: AiConfig,
    model: string,
    prompt: string,
    references: ReferenceImage[],
    generationMode: VideoGenerationMode,
    capability: VideoModelCapability | null,
    options?: RequestOptions,
): Promise<VideoGenerationTask> {
    const initialUrls = references.map(agnesReferenceImageUrl);
    if (!references.length || initialUrls.every(Boolean)) {
        try {
            return await sendAgnesCreateRequest(config, model, prompt, initialUrls, generationMode, capability, options);
        } catch (error) {
            if (!references.length || !isAgnesImageUrlError(error)) {
                throw new Error(readAxiosError(error, "Agnes 视频任务创建失败"));
            }
        }
    }

    const token = useUserStore.getState().token.trim();
    if (!token) throw new Error("本地参考图需要先登录后端账号，才能上传为 Agnes 可访问的公网图片");
    let publicUrls: string[];
    try {
        publicUrls = await uploadReferencesToBackend(references, token, options?.signal);
    } catch (error) {
        throw new Error(`参考图上传至账号后端失败。请检查 backend-config.yml 中的后端公网访问地址和媒体路由是否可用。详细：${readAxiosError(error, "参考图上传失败")}`);
    }
    try {
        return await sendAgnesCreateRequest(config, model, prompt, publicUrls, generationMode, capability, options);
    } catch (error) {
        throw new Error(readAxiosError(error, "Agnes 视频任务创建失败"));
    }
}

async function sendAgnesCreateRequest(
    config: AiConfig,
    model: string,
    prompt: string,
    urls: string[],
    generationMode: VideoGenerationMode,
    capability: VideoModelCapability | null,
    options?: RequestOptions,
): Promise<VideoGenerationTask> {
    const requestedSeconds = Math.max(1, Math.min(20, Math.floor(Number(config.videoSeconds) || 6)));
    const seconds = capability ? requireSupportedNumber(requestedSeconds, capability.durations, "时长") : requestedSeconds;
    const ratio = capability ? requireSupportedString(normalizeSeedanceRatio(config.size), capability.ratios, "画面比例") : config.size;
    const resolution = capability ? requireSupportedString(normalizeResolutionToken(config.vquality), capability.resolutions, "分辨率") : normalizeVideoResolution(config.vquality);
    const body: Record<string, unknown> = {
        prompt,
        seconds,
        size: ratio,
        resolution_name: resolution,
        frame_rate: 24,
        _flowcanvas_mode: generationMode,
    };
    if (urls.length) body.input_reference = urls;

    const url = agnesVideoCreateUrl(config);
    const created = (await axios.post<AgnesTask>(url, body, { headers: { ...aiHeaders(config, "application/json"), ...durableGenerationHeaders(url, options?.jobId) }, signal: options?.signal, timeout: AGNES_VIDEO_CREATE_TIMEOUT_MS })).data;
    if (created.error?.message) throw new Error(created.error.message);
    const taskId = created.video_id || created.task_id || created.id;
    if (!taskId) throw new Error("Agnes 视频接口没有返回任务 ID");
    return { id: taskId, provider: "agnes", model: modelOptionName(model) };
}

async function uploadReferencesToBackend(references: ReferenceImage[], token: string, signal?: AbortSignal): Promise<string[]> {
    return Promise.all(
        references.map(async (image) => {
            const dataUrl = await imageToDataUrl(image);
            if (!dataUrl) throw new Error("读取本地参考图失败");
            // CSP connect-src 不允许 data: URL 作为 fetch 目标，data URL 直接解码为 Blob
            const blob = dataUrl.startsWith("data:") ? dataUrlToBlob(dataUrl) : await (await fetch(dataUrl)).blob();
            return uploadImageToCurrentBackend(token, blob, image.name || "reference.png");
        }),
    );
}

// Agnes 的图片格式错误通常返回 400/422/415，且响应文本里包含 image / url / 图片 / invalid 之一；
// 鉴权/余额等错误走其它状态码或不含这些关键字，避免被误判为图片问题触发无效重试
const AGNES_IMAGE_ERROR_KEYWORDS = ["image url", "image_url", "imageurl", "图片", "图片url", "图片格式", "图片无效", "图片错误", "图片地址", "invalid image", "invalid url", "incorrect padding", "image format", "image invalid", "image must be"];

function isAgnesImageUrlError(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;
    const status = error.response?.status;
    if (status && status !== 400 && status !== 422 && status !== 415 && status !== 500) return false;
    const responseData = error.response?.data;
    let text = "";
    if (typeof responseData === "string") text = responseData;
    else if (responseData && typeof responseData === "object") text = JSON.stringify(responseData);
    if (!text) return false;
    const lower = text.toLowerCase();
    return AGNES_IMAGE_ERROR_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase()));
}

async function pollAgnesVideoTask(config: AiConfig, task: VideoGenerationTask, options?: RequestOptions): Promise<VideoGenerationTaskState> {
    try {
        const taskResp = (await axios.get<AgnesTask>(agnesVideoPollUrl(config, task), { headers: aiHeaders(config), signal: options?.signal, timeout: VIDEO_POLL_TIMEOUT_MS })).data;
        if (taskResp.error?.message) return { status: "failed", error: taskResp.error.message };
        if (taskResp.status === "completed") {
            const videoUrl = [taskResp.video_url, taskResp.url, taskResp.remixed_from_video_id].find(isHttpUrl);
            if (!videoUrl) return { status: "failed", error: "Agnes 任务完成但没有返回视频 URL" };
            return { status: "completed", result: await videoResultFromUrl(rewriteThroughProxy(videoUrl, config.useProxy), options) };
        }
        if (taskResp.status === "failed") return { status: "failed", error: taskResp.error?.message || "Agnes 视频生成失败" };
        return { status: "pending" };
    } catch (error) {
        // 5xx / 429 是 Agnes 服务端瞬时问题（litellm busy 等），任务可能仍在后端排队；
        // 当作 pending 让外层循环继续轮询，不浪费已经创建的 task_id
        if (axios.isAxiosError(error)) {
            const status = error.response?.status;
            if (status && status >= 500) {
                return { status: "pending" };
            }
            if (status === 429) {
                return { status: "pending" };
            }
        }
        throw new Error(readAxiosError(error, "Agnes 任务查询失败"));
    }
}

async function videoResultFromUrl(url: string, options?: RequestOptions): Promise<VideoGenerationResult> {
    return { blob: await downloadVideoBlob(url, options) };
}

async function downloadVideoBlob(url: string, options?: RequestOptions) {
    const directTarget = unwrapProxyTarget(url);
    const candidates = Array.from(new Set([
        url,
        isHttpUrl(directTarget) ? rewriteThroughProxy(directTarget, true) : "",
    ].filter(Boolean)));
    let lastError: unknown;
    for (const candidate of candidates) {
        try {
            const response = await axios.get<Blob>(candidate, { responseType: "blob", signal: options?.signal, timeout: VIDEO_DOWNLOAD_TIMEOUT_MS });
            await assertVideoBlob(response.data);
            return response.data;
        } catch (error) {
            if (axios.isCancel(error) || options?.signal?.aborted) throw error;
            lastError = error;
        }
    }
    throw new Error(readAxiosError(lastError, "视频已生成，但下载或保存失败"));
}

function unwrapProxyTarget(url: string) {
    try {
        const parsed = new URL(url, window.location.origin);
        return parsed.pathname.endsWith("/api/ai-proxy") ? parsed.searchParams.get("target") || url : url;
    } catch {
        return url;
    }
}

function isHttpUrl(value: unknown): value is string {
    return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function assertVideoConfig(config: AiConfig, model: string) {
    if (!model) throw new Error("请先配置视频模型");
    if (!config.baseUrl.trim()) throw new Error("请先配置 Base URL");
    if (!config.apiKey.trim()) throw new Error("请先配置 API Key");
    if (config.apiFormat === "gemini") throw new Error("Gemini 调用格式暂不支持视频生成，请使用 OpenAI 格式渠道");
}

function normalizeVideoSeconds(value: string) {
    const seconds = Math.floor(Number(value) || 6);
    return String(Math.max(1, Math.min(20, seconds)));
}

function normalizeVideoSize(value: string) {
    if (value === "auto") return null;
    const size = value || "1280x720";
    if (/^\d+x\d+$/.test(size)) return size;
    return ["9:16", "2:3", "3:4"].includes(size) ? "720x1280" : "1280x720";
}

function normalizeVideoResolution(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const resolution = value.replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

function requireSupportedString(value: string, values: string[], label: string) {
    if (!values.length || values.includes(value)) return value;
    throw new Error(`当前模型不支持${label} ${value}，可选值：${values.join("、")}`);
}

function requireSupportedNumber(value: number, values: number[], label: string) {
    if (!values.length || values.includes(value)) return value;
    throw new Error(`当前模型不支持${label} ${value}，可选值：${values.join("、")}`);
}

function unwrapVideoResponse(payload: ApiVideoResponse) {
    return unwrapEnvelope(payload, "接口没有返回视频任务");
}

function unwrapEnvelope<T>(payload: ApiEnvelope<T>, emptyMessage: string): T {
    if (!payload) throw new Error(emptyMessage);
    if (typeof payload === "object" && "code" in payload && typeof payload.code === "number") {
        if (payload.code !== 0) throw new Error(payload.msg || "请求失败");
        if (!payload.data) throw new Error(emptyMessage);
        return payload.data;
    }
    return payload as T;
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return "请求已取消";
    if (axios.isAxiosError<string | { error?: { message?: string }; message?: string; msg?: string; code?: number }>(error)) {
        if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") return "请求超时，请检查网络或稍后重试";
        const responseData = error.response?.data;
        if (typeof responseData === "string") return responseData.trim() || statusMessage(error.response?.status, fallback);
        return responseData?.msg || responseData?.message || normalizeUpstreamMessage(responseData?.error?.message) || statusMessage(error.response?.status, fallback);
    }
    if (error instanceof DOMException && error.name === "AbortError") return "请求已取消";
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

async function assertVideoBlob(blob: Blob) {
    if (!blob.size) throw new Error("视频下载结果为空");
    const type = blob.type.toLowerCase();
    if (!type || type.startsWith("video/") || type.includes("octet-stream")) return;
    if (!type.includes("json") && !type.startsWith("text/") && !type.includes("xml") && !type.includes("html")) {
        throw new Error(`视频下载地址返回了不支持的文件类型：${type}`);
    }
    let payload: { code?: number; msg?: string; error?: { message?: string } };
    try {
        payload = JSON.parse(await blob.text()) as { code?: number; msg?: string; error?: { message?: string } };
    } catch {
        throw new Error("视频下载地址返回的不是视频文件");
    }
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || "视频下载失败");
    if (payload.error?.message) throw new Error(payload.error.message);
    throw new Error(payload.msg || "视频下载地址返回的不是视频文件");
}

function isPublicMediaUrl(value: string) {
    return /^https?:\/\//i.test(value || "");
}

function delay(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(abortError());
            return;
        }
        const onAbort = () => {
            clearTimeout(timer);
            reject(abortError());
        };
        const timer = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

function abortError() {
    return new DOMException("Aborted", "AbortError");
}
