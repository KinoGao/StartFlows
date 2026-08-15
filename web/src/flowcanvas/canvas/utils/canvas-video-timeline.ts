import { normalizeVideoTrimRange, pickTrimRecorderMimeType, VIDEO_TRIM_MIN_SECONDS, loadVideoElement, releaseVideoElement, seekVideo } from "./canvas-video-tools";

/** 播放头移动步长（秒）：←/→ */
export const TIMELINE_SEEK_STEP_SECONDS = 1;
/** 片段长度调整步长（秒）：↑/↓ */
export const TIMELINE_LENGTH_STEP_SECONDS = 0.1;
/** 片段长度精调步长（秒）：Shift+↑/↓ */
export const TIMELINE_LENGTH_FINE_STEP_SECONDS = 0.01;

export type TimelineClipKind = "video" | "audio";

export type TimelineClip = {
    /** 来源节点 id */
    id: string;
    kind: TimelineClipKind;
    title: string;
    src: string;
    /** 素材原始时长（秒），0 表示元数据未加载 */
    duration: number;
    inPoint: number;
    outPoint: number;
    /** 仅音频轨使用：静音后不参与预览与导出混音 */
    muted: boolean;
};

export type TimelineClipLayout = {
    clip: TimelineClip;
    /** 片段在时间轴上的起点（秒） */
    start: number;
    end: number;
};

export type TimelineLayout = {
    items: TimelineClipLayout[];
    totalDuration: number;
};

export type TimelineShortcutAction =
    | { type: "toggle-play" }
    | { type: "delete-selected" }
    | { type: "mark"; point: "in" | "out" }
    | { type: "seek"; deltaSeconds: number }
    | { type: "adjust-length"; deltaSeconds: number };

/** 从来源素材创建片段：时长未知时为 0，等待元数据加载后由 withClipDuration 补齐。 */
export function createTimelineClip(source: { id: string; kind: TimelineClipKind; title: string; src: string }): TimelineClip {
    return { id: source.id, kind: source.kind, title: source.title, src: source.src, duration: 0, inPoint: 0, outPoint: 0, muted: false };
}

/** 元数据加载完成后写入原始时长，默认选取完整区间；时长过短无法裁剪时保持 0。 */
export function withClipDuration(clip: TimelineClip, durationSeconds: number): TimelineClip {
    const duration = Number.isFinite(durationSeconds) ? roundTime(durationSeconds) : 0;
    const range = normalizeVideoTrimRange(0, duration, duration);
    return { ...clip, duration: range ? duration : 0, inPoint: range?.start ?? 0, outPoint: range?.end ?? 0 };
}

export function clipEffectiveDuration(clip: TimelineClip): number {
    return Math.max(0, clip.outPoint - clip.inPoint);
}

/** 顺序排列片段，计算每个片段的时间轴区间与总时长。 */
export function layoutTimeline(clips: TimelineClip[]): TimelineLayout {
    let cursor = 0;
    const items = clips.map((clip) => {
        const start = roundTime(cursor);
        const end = roundTime(cursor + clipEffectiveDuration(clip));
        cursor = end;
        return { clip, start, end };
    });
    return { items, totalDuration: cursor };
}

/** 校验并更新片段入点/出点，区间无效时返回原片段。 */
export function updateClipRange(clip: TimelineClip, inPoint: number, outPoint: number): TimelineClip {
    const range = normalizeVideoTrimRange(inPoint, outPoint, clip.duration);
    return range ? { ...clip, inPoint: range.start, outPoint: range.end } : clip;
}

/** 调整片段出点（↑/↓ 快捷键），自动夹取最小时长与素材时长。 */
export function adjustClipOutPoint(clip: TimelineClip, deltaSeconds: number): TimelineClip {
    return updateClipRange(clip, clip.inPoint, clip.outPoint + deltaSeconds);
}

/** 把播放头所在帧设为选中片段的入点或出点（I/O 快捷键）。 */
export function setClipPointFromPlayhead(clip: TimelineClip, layoutStart: number, playhead: number, point: "in" | "out"): TimelineClip {
    const sourceTime = clip.inPoint + (playhead - layoutStart);
    return point === "in" ? updateClipRange(clip, sourceTime, clip.outPoint) : updateClipRange(clip, clip.inPoint, sourceTime);
}

/** 拖拽排序：把片段移动到目标下标。 */
export function moveTimelineClip(clips: TimelineClip[], clipId: string, targetIndex: number): TimelineClip[] {
    const fromIndex = clips.findIndex((clip) => clip.id === clipId);
    if (fromIndex < 0) return clips;
    const clamped = Math.max(0, Math.min(clips.length - 1, targetIndex));
    if (clamped === fromIndex) return clips;
    const next = [...clips];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(clamped, 0, moved);
    return next;
}

export function removeTimelineClip(clips: TimelineClip[], clipId: string): TimelineClip[] {
    return clips.filter((clip) => clip.id !== clipId);
}

/** 把时间轴全局时间映射到片段与其素材本地时间；越界时夹取到最后一个片段末尾。 */
export function locateTimelineTime(layout: TimelineLayout, time: number): { item: TimelineClipLayout; sourceTime: number } | null {
    if (!layout.items.length || !Number.isFinite(time) || time < 0 || time > layout.totalDuration) return null;
    const item = layout.items.find((entry) => time < entry.end) || layout.items[layout.items.length - 1];
    if (!item || item.end <= item.start) return null;
    const offset = Math.min(Math.max(time - item.start, 0), item.end - item.start);
    return { item, sourceTime: roundTime(item.clip.inPoint + offset) };
}

/** 时间轴快捷键映射；带 Ctrl/Meta/Alt 的组合键放行给系统。 */
export function resolveTimelineShortcut(event: { key: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): TimelineShortcutAction | null {
    if (event.ctrlKey || event.metaKey || event.altKey) return null;
    switch (event.key) {
        case " ":
            return { type: "toggle-play" };
        case "Delete":
        case "Backspace":
            return { type: "delete-selected" };
        case "i":
        case "I":
            return { type: "mark", point: "in" };
        case "o":
        case "O":
            return { type: "mark", point: "out" };
        case "ArrowLeft":
            return { type: "seek", deltaSeconds: -TIMELINE_SEEK_STEP_SECONDS };
        case "ArrowRight":
            return { type: "seek", deltaSeconds: TIMELINE_SEEK_STEP_SECONDS };
        case "ArrowUp":
            return { type: "adjust-length", deltaSeconds: event.shiftKey ? TIMELINE_LENGTH_FINE_STEP_SECONDS : TIMELINE_LENGTH_STEP_SECONDS };
        case "ArrowDown":
            return { type: "adjust-length", deltaSeconds: event.shiftKey ? -TIMELINE_LENGTH_FINE_STEP_SECONDS : -TIMELINE_LENGTH_STEP_SECONDS };
        default:
            return null;
    }
}

/** 输入框 / 文本域 / 滑杆聚焦时不劫持按键（结构鸭子类型，便于在 node 环境测试）。 */
export function isTimelineEditableTarget(target: { tagName?: unknown; isContentEditable?: boolean; getAttribute?: (name: string) => string | null } | null): boolean {
    if (!target || typeof target.tagName !== "string") return false;
    const tag = target.tagName.toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (target.isContentEditable) return true;
    return typeof target.getAttribute === "function" && target.getAttribute("role") === "slider";
}

function roundTime(value: number): number {
    return Math.max(0, Math.round(value * 100) / 100);
}

// ===== 以下依赖浏览器 DOM，不参与单元测试 =====

/** 按时间轴顺序拼接视频片段并混合未静音音频轨，用 canvas.captureStream + MediaRecorder 重编码导出。 */
export async function composeVideoTimeline(videoClips: TimelineClip[], audioClips: TimelineClip[], onProgress?: (exportedSeconds: number, totalSeconds: number) => void): Promise<Blob> {
    const layout = layoutTimeline(videoClips.filter((clip) => clipEffectiveDuration(clip) >= VIDEO_TRIM_MIN_SECONDS));
    if (!layout.items.length || layout.totalDuration <= 0) throw new Error("时间轴为空，无法合成导出");
    if (typeof MediaRecorder === "undefined") throw new Error("当前浏览器不支持视频合成导出，请换用 Chrome / Edge");
    const mimeType = pickTrimRecorderMimeType((candidate) => MediaRecorder.isTypeSupported(candidate));
    if (!mimeType) throw new Error("当前浏览器不支持视频合成导出，请换用 Chrome / Edge");

    const videos = await Promise.all(layout.items.map((item) => loadVideoElement(item.clip.src)));
    const audioLayout = layoutTimeline(audioClips.filter((clip) => clipEffectiveDuration(clip) > 0));
    const audios = audioLayout.items.map((item) => {
        const element = new Audio();
        element.crossOrigin = "anonymous";
        element.preload = "auto";
        element.src = item.clip.src;
        return element;
    });

    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    // 视频原声常开；音频轨按静音状态决定是否混入。CORS 等导致无法接入音源时跳过并保持静音。
    videos.forEach((video) => connectMediaSource(audioContext, destination, video, false));
    audios.forEach((audio, index) => connectMediaSource(audioContext, destination, audio, audioLayout.items[index].clip.muted));

    const canvas = document.createElement("canvas");
    canvas.width = videos[0].videoWidth;
    canvas.height = videos[0].videoHeight;
    const context = canvas.getContext("2d");
    if (!context || !canvas.width || !canvas.height) throw new Error("无法创建合成画布");
    const canvasStream = canvas.captureStream(30);
    const stream = new MediaStream([...canvasStream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
    };

    let rafId = 0;
    const stopAll = () => {
        if (rafId) cancelAnimationFrame(rafId);
        videos.forEach((video) => video.pause());
        audios.forEach((audio) => audio.pause());
    };
    try {
        await audioContext.resume();
        await seekVideo(videos[0], layout.items[0].clip.inPoint);
        const stopped = new Promise<void>((resolve) => {
            recorder.onstop = () => resolve();
        });
        await new Promise<void>((resolve, reject) => {
            const timeout = window.setTimeout(() => reject(new Error("视频合成导出超时")), Math.max(15_000, layout.totalDuration * 3000 + 15_000));
            let index = 0;
            const finish = () => {
                window.clearTimeout(timeout);
                stopAll();
                if (recorder.state !== "inactive") recorder.stop();
                resolve();
            };
            const tick = () => {
                const item = layout.items[index];
                const video = videos[index];
                if (!item || !video) {
                    finish();
                    return;
                }
                if (video.currentTime >= item.clip.outPoint - 0.02 || video.ended) {
                    video.pause();
                    index += 1;
                    if (index >= layout.items.length) {
                        onProgress?.(layout.totalDuration, layout.totalDuration);
                        finish();
                        return;
                    }
                    const next = layout.items[index];
                    videos[index].currentTime = next.clip.inPoint;
                    videos[index].play().catch(() => reject(new Error("视频播放失败，无法合成导出")));
                    syncAudioTracks(audioLayout.items, audios, next.start);
                    onProgress?.(next.start, layout.totalDuration);
                } else {
                    context.drawImage(video, 0, 0, canvas.width, canvas.height);
                    const globalTime = Math.min(layout.totalDuration, item.start + Math.max(0, video.currentTime - item.clip.inPoint));
                    syncAudioTracks(audioLayout.items, audios, globalTime);
                    onProgress?.(globalTime, layout.totalDuration);
                }
                rafId = requestAnimationFrame(tick);
            };
            recorder.start(250);
            videos[0].play().catch(() => reject(new Error("视频播放失败，无法合成导出")));
            rafId = requestAnimationFrame(tick);
        });
        await stopped;
        const blob = new Blob(chunks, { type: mimeType.split(";")[0] });
        if (!blob.size) throw new Error("视频合成导出结果为空");
        return blob;
    } finally {
        stopAll();
        stream.getTracks().forEach((track) => track.stop());
        canvasStream.getTracks().forEach((track) => track.stop());
        void audioContext.close();
        videos.forEach(releaseVideoElement);
        audios.forEach((audio) => {
            audio.removeAttribute("src");
            audio.load();
        });
    }
}

/** 预览 / 导出共用的音频轨同步：按全局时间对齐未静音音频片段的播放位置。 */
export function syncAudioTracks(items: TimelineClipLayout[], audios: HTMLAudioElement[], globalTime: number) {
    items.forEach((item, index) => {
        const audio = audios[index];
        if (!audio) return;
        const within = globalTime >= item.start && globalTime < item.end && !item.clip.muted;
        if (!within) {
            if (!audio.paused) audio.pause();
            return;
        }
        const expected = item.clip.inPoint + (globalTime - item.start);
        if (audio.paused || Math.abs(audio.currentTime - expected) > 0.35) audio.currentTime = expected;
        if (audio.paused) audio.play().catch(() => {});
    });
}

function connectMediaSource(audioContext: AudioContext, destination: MediaStreamAudioDestinationNode, element: HTMLMediaElement, muted: boolean) {
    try {
        const source = audioContext.createMediaElementSource(element);
        const gain = audioContext.createGain();
        gain.gain.value = muted ? 0 : 1;
        source.connect(gain).connect(destination);
    } catch {
        element.muted = true;
    }
}
