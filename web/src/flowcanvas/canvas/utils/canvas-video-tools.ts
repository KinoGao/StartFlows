import type { CanvasScriptBeat } from "../types";

/** 视频解析抽帧：默认每 2 秒 1 帧，最多 10 帧 */
export const VIDEO_ANALYSIS_MAX_FRAMES = 10;
export const VIDEO_ANALYSIS_INTERVAL_SECONDS = 2;
/** 剪辑片段最短时长（秒） */
export const VIDEO_TRIM_MIN_SECONDS = 0.2;

export type VideoFrameSample = { time: number; dataUrl: string };
export type VideoTrimRange = { start: number; end: number };

/** 计算抽帧时间点：短视频按间隔取帧，长视频等距铺满到上限。 */
export function planVideoFrameTimes(durationSeconds: number, maxFrames = VIDEO_ANALYSIS_MAX_FRAMES, intervalSeconds = VIDEO_ANALYSIS_INTERVAL_SECONDS): number[] {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
    const count = Math.max(1, Math.min(maxFrames, Math.ceil(durationSeconds / intervalSeconds)));
    const step = durationSeconds / count;
    return Array.from({ length: count }, (_, index) => roundTime(Math.min(index * step + step / 2, durationSeconds - 0.05)));
}

/** 组装视频解析提示词：要求模型只输出分镜 JSON 数组。 */
export function buildVideoStoryboardPrompt(frames: VideoFrameSample[], durationSeconds: number): string {
    const timeline = frames.map((frame, index) => `第 ${index + 1} 帧 ≈ ${frame.time.toFixed(1)}s`).join("，");
    return [
        `下面 ${frames.length} 张图片是按时间顺序从一段约 ${durationSeconds.toFixed(1)} 秒的视频中抽取的画面帧（${timeline}）。`,
        "请把这段视频拆解为分镜表，识别其中的镜头段落（按画面内容/场景/主体变化划分），每个镜头给出：标题（2-8 字）、景别（大远景/远景/全景/中景/近景/特写，可省略）、估计时长（如 \"3s\"）、画面描述（主体、动作、场景、氛围，30 字以内）。",
        "分镜规范：同一镜头内主体与场景必须一致，主体/场景明显切换即视为新镜头；画面描述写可拍的具体画面（\"人怎么干\"而非\"人干什么\"），相邻镜头衔接保持空间与动作连贯；景别变化体现节奏，情绪高点用近景/特写。",
        '只输出一个 JSON 数组，不要输出其他内容，格式：[{"title":"...","shotType":"中景","duration":"3s","content":"画面描述"}]',
    ].join("\n");
}

/** 解析模型返回的分镜 JSON，失败或无有效条目时返回空数组。 */
export function parseVideoStoryboardResponse(text: string): CanvasScriptBeat[] {
    const json = extractJsonArray(text);
    if (!json) return [];
    let raw: unknown;
    try {
        raw = JSON.parse(json);
    } catch {
        return [];
    }
    if (!Array.isArray(raw)) return [];
    return raw
        .slice(0, 24)
        .map((item, index): CanvasScriptBeat | null => {
            if (!item || typeof item !== "object") return null;
            const record = item as Record<string, unknown>;
            const content = typeof record.content === "string" ? record.content.trim() : "";
            const title = (typeof record.title === "string" && record.title.trim()) || content.slice(0, 12) || `分镜 ${index + 1}`;
            if (!content && !title) return null;
            return {
                id: `beat-${index + 1}`,
                title: title.slice(0, 24),
                content: content || title,
                shotType: typeof record.shotType === "string" && record.shotType.trim() ? record.shotType.trim() : undefined,
                duration: normalizeBeatDuration(record.duration),
                prompt: `根据脚本分镜生成画面：${content || title}。要求画面有清晰主体、镜头景别、动作和氛围，电影感构图。`,
            };
        })
        .filter((beat): beat is CanvasScriptBeat => Boolean(beat));
}

/** 把分镜表转成脚本正文（每行「标题：画面描述」，供脚本节点沿用现有分镜解析）。 */
export function buildVideoStoryboardBody(beats: CanvasScriptBeat[]): string {
    return beats.map((beat) => `${beat.title}：${beat.content}`).join("\n");
}

/** 校验并修正剪辑入点/出点，区间无效时返回 null。 */
export function normalizeVideoTrimRange(start: number, end: number, durationSeconds: number): VideoTrimRange | null {
    if (!Number.isFinite(durationSeconds) || durationSeconds <= VIDEO_TRIM_MIN_SECONDS) return null;
    const clampedStart = clampTime(Math.min(start, end), durationSeconds);
    let clampedEnd = clampTime(Math.max(start, end), durationSeconds);
    if (clampedEnd - clampedStart < VIDEO_TRIM_MIN_SECONDS) clampedEnd = Math.min(durationSeconds, clampedStart + VIDEO_TRIM_MIN_SECONDS);
    if (clampedEnd - clampedStart < VIDEO_TRIM_MIN_SECONDS) return null;
    return { start: roundTime(clampedStart), end: roundTime(clampedEnd) };
}

/** 挑选浏览器支持的录制格式，都不支持时返回空串。 */
export function pickTrimRecorderMimeType(isTypeSupported: (mimeType: string) => boolean): string {
    const candidates = ["video/mp4", 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', "video/webm"];
    return candidates.find(isTypeSupported) || "";
}

/** 剪辑时间显示：分:秒.毫秒（一位小数）。 */
export function formatTrimTime(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00.0";
    const minutes = Math.floor(seconds / 60);
    const rest = seconds - minutes * 60;
    return `${minutes}:${rest < 10 ? "0" : ""}${rest.toFixed(1)}`;
}

function extractJsonArray(text: string): string {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const source = fenced ? fenced[1] : text;
    const start = source.indexOf("[");
    const end = source.lastIndexOf("]");
    return start >= 0 && end > start ? source.slice(start, end + 1) : "";
}

function normalizeBeatDuration(value: unknown): string | undefined {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return `${Math.round(value)}s`;
    if (typeof value === "string") {
        const match = value.trim().match(/(\d+(?:\.\d+)?)/);
        if (match) return `${Math.round(Number(match[1]))}s`;
    }
    return undefined;
}

function clampTime(value: number, durationSeconds: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(Math.max(value, 0), durationSeconds);
}

function roundTime(value: number): number {
    return Math.max(0, Math.round(value * 100) / 100);
}

// ===== 以下依赖浏览器 DOM，不参与单元测试 =====

type CaptureOptions = { maxFrames?: number; intervalSeconds?: number; maxWidth?: number };

/** 从视频中按抽帧计划截取 JPEG 帧图（data URL）。 */
export async function captureVideoFrames(src: string, options?: CaptureOptions): Promise<{ frames: VideoFrameSample[]; duration: number }> {
    const video = await loadVideoElement(src);
    try {
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const times = planVideoFrameTimes(duration, options?.maxFrames, options?.intervalSeconds);
        const maxWidth = options?.maxWidth ?? 640;
        const scale = video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        const context = canvas.getContext("2d");
        if (!context || !canvas.width || !canvas.height) throw new Error("无法创建抽帧画布");
        const frames: VideoFrameSample[] = [];
        for (const time of times) {
            await seekVideo(video, time);
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            frames.push({ time, dataUrl: canvas.toDataURL("image/jpeg", 0.72) });
        }
        return { frames, duration };
    } finally {
        releaseVideoElement(video);
    }
}

/** 用 captureStream + MediaRecorder 重编码导出 [start, end) 片段（耗时与片段时长相当）。 */
export async function trimVideoSegment(src: string, range: VideoTrimRange, onProgress?: (exportedSeconds: number) => void): Promise<Blob> {
    if (typeof MediaRecorder === "undefined") throw new Error("当前浏览器不支持视频裁切导出，请换用 Chrome / Edge");
    const mimeType = pickTrimRecorderMimeType((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) throw new Error("当前浏览器不支持视频裁切导出，请换用 Chrome / Edge");
    const video = await loadVideoElement(src);
    // muted 只影响扬声器输出，captureStream 仍会采到原音轨
    video.muted = true;
    const capturable = video as HTMLVideoElement & { captureStream?: () => MediaStream };
    const stream = typeof capturable.captureStream === "function" ? capturable.captureStream() : null;
    if (!stream) {
        releaseVideoElement(video);
        throw new Error("当前浏览器不支持视频裁切导出，请换用 Chrome / Edge");
    }
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
    };
    try {
        await seekVideo(video, range.start);
        const stopped = new Promise<void>((resolve) => {
            recorder.onstop = () => resolve();
        });
        await new Promise<void>((resolve, reject) => {
            const timeout = window.setTimeout(() => reject(new Error("剪辑导出超时")), Math.max(15_000, (range.end - range.start) * 3000 + 15_000));
            const finish = () => {
                window.clearTimeout(timeout);
                video.removeEventListener("timeupdate", onTimeUpdate);
                video.removeEventListener("ended", onEnded);
                video.pause();
                if (recorder.state !== "inactive") recorder.stop();
                resolve();
            };
            const onTimeUpdate = () => {
                onProgress?.(Math.min(video.currentTime, range.end) - range.start);
                if (video.currentTime >= range.end) finish();
            };
            const onEnded = () => finish();
            video.addEventListener("timeupdate", onTimeUpdate);
            video.addEventListener("ended", onEnded);
            recorder.start(250);
            video.play().catch(() => reject(new Error("视频播放失败，无法导出剪辑片段")));
        });
        await stopped;
        const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
        if (!blob.size) throw new Error("剪辑导出结果为空");
        return blob;
    } finally {
        stream.getTracks().forEach((track) => track.stop());
        releaseVideoElement(video);
    }
}

export async function loadVideoElement(src: string): Promise<HTMLVideoElement> {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = src;
    await waitVideoEvent(video, "loadedmetadata");
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) await waitVideoEvent(video, "loadeddata");
    if (!video.videoWidth || !video.videoHeight) throw new Error("视频画面尚未加载完成");
    return video;
}

export async function seekVideo(video: HTMLVideoElement, time: number) {
    if (Math.abs(video.currentTime - time) > 0.001) {
        const seeked = waitVideoEvent(video, "seeked");
        video.currentTime = time;
        await seeked;
    }
}

function waitVideoEvent(video: HTMLVideoElement, eventName: "loadedmetadata" | "loadeddata" | "seeked") {
    return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
            video.removeEventListener(eventName, handleSuccess);
            video.removeEventListener("error", handleError);
        };
        const handleSuccess = () => {
            cleanup();
            resolve();
        };
        const handleError = () => {
            cleanup();
            reject(new Error("视频读取失败"));
        };
        video.addEventListener(eventName, handleSuccess, { once: true });
        video.addEventListener("error", handleError, { once: true });
    });
}

export function releaseVideoElement(video: HTMLVideoElement) {
    video.removeAttribute("src");
    video.load();
}
