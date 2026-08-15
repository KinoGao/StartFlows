export const VIDEO_GENERATION_TIMEOUT_MS = 30 * 60 * 1000;
export const VIDEO_GENERATION_TIMEOUT_MESSAGE = "视频生成超过30分钟，任务已自动结束。";

export class VideoGenerationTimeoutError extends Error {
    constructor(message = VIDEO_GENERATION_TIMEOUT_MESSAGE) {
        super(message);
        this.name = "VideoGenerationTimeoutError";
    }
}

export function remainingVideoGenerationTime(startedAt: number, now = Date.now()) {
    return Math.max(0, startedAt + VIDEO_GENERATION_TIMEOUT_MS - now);
}

export function assertVideoGenerationActive(startedAt: number, now = Date.now()) {
    if (remainingVideoGenerationTime(startedAt, now) <= 0) {
        throw new VideoGenerationTimeoutError();
    }
}