import { normalizeResolutionToken, normalizeSeedanceRatio } from "@/flowcanvas/lib/seedance-video";
import { normalizeVideoGenerationMode, videoRatiosForMode, type VideoGenerationMode, type VideoModelCapability } from "@/flowcanvas/services/api/model-capabilities";
import type { AiConfig } from "@/flowcanvas/stores/use-config-store";

import type { CanvasNodeMetadata } from "../types";

export type ActiveVideoReferenceCounts = { image: number; video: number; audio: number };

export const VIDEO_GENERATION_MODE_LABELS: Record<VideoGenerationMode, string> = {
    "text-to-video": "文生视频",
    "all-in-one-reference": "全能参考",
    "image-to-video": "首帧图生视频",
    "first-last-frame": "首尾帧图生视频",
    "image-reference": "图片参考",
    "multi-frame": "智能多帧",
};

export function validateVideoReferenceCounts(mode: VideoGenerationMode, capability: VideoModelCapability, counts: ActiveVideoReferenceCounts) {
    mode = normalizeVideoGenerationMode(mode, capability);
    const mediaCount = counts.image + counts.video + counts.audio;
    if (mode === "text-to-video") return mediaCount > 0 ? "文生视频不能携带图片、视频或音频参考素材" : "";
    if (mode !== "all-in-one-reference" && (counts.video > 0 || counts.audio > 0)) return `${VIDEO_GENERATION_MODE_LABELS[mode]}仅支持图片参考素材`;
    if (mode === "image-to-video" && counts.image !== 1) return "首帧图生视频需要且仅支持 1 张参考图片";
    if (mode === "first-last-frame" && counts.image !== 2) return "首尾帧视频需要按顺序连接首帧和尾帧两张图片";
    if (mode === "image-reference" && counts.image < 1) return "图片参考模式至少需要连接 1 张参考图片";
    if (mode === "multi-frame" && counts.image < 3) return "智能多帧至少需要按顺序连接 3 张参考图片";
    if ((mode === "image-reference" || mode === "multi-frame" || mode === "all-in-one-reference") && counts.image > capability.maxImages) {
        return `当前模型最多支持 ${capability.maxImages} 个参考图片`;
    }
    if (mode === "all-in-one-reference" && counts.video > capability.maxVideos) return `当前模型最多支持 ${capability.maxVideos} 个参考视频`;
    if (mode === "all-in-one-reference" && counts.audio > capability.maxAudios) return `当前模型最多支持 ${capability.maxAudios} 个参考音频`;
    if (mode === "all-in-one-reference" && mediaCount === 0) return "全能参考模式至少需要连接一项图片、视频或音频素材";
    if (mode === "all-in-one-reference" && counts.audio > 0 && counts.image + counts.video === 0) return "参考音频不能单独使用，请同时连接参考图片或视频";
    return "";
}

export function supportedVideoMode(value: VideoGenerationMode | undefined, capability: VideoModelCapability | null | undefined): VideoGenerationMode | undefined {
    if (!capability?.modes.length) return undefined;
    const normalized = value ? normalizeVideoGenerationMode(value, capability) : undefined;
    return normalized && capability.modes.includes(normalized) ? normalized : capability.modes[0];
}

export function videoCapabilitySignature(capability: VideoModelCapability | null | undefined) {
    if (!capability) return "";
    return [
        capability.id,
        capability.modelPatterns.join(","),
        capability.modes.join(","),
        capability.ratios.join(","),
        capability.resolutions.join(","),
        capability.durations.join(","),
        capability.counts.join(","),
        capability.generateAudio ? "1" : "0",
        capability.watermark ? "1" : "0",
        capability.draft ? "1" : "0",
    ].join("\u001f");
}

export function normalizeVideoConfig(currentMode: VideoGenerationMode | undefined, config: AiConfig, capability: VideoModelCapability): Partial<CanvasNodeMetadata> {
    const patch: Partial<CanvasNodeMetadata> = {};
    const normalizedMode = currentMode ? normalizeVideoGenerationMode(currentMode, capability) : undefined;
    const effectiveMode = normalizedMode && capability.modes.includes(normalizedMode) ? normalizedMode : capability.modes[0];
    if (!normalizedMode || !capability.modes.includes(normalizedMode)) patch.videoGenerationMode = effectiveMode;
    else if (normalizedMode !== currentMode) patch.videoGenerationMode = normalizedMode;

    const ratio = normalizeSeedanceRatio(config.size);
    const ratios = videoRatiosForMode(capability, effectiveMode);
    if (ratios.length && !ratios.includes(ratio)) patch.size = ratios.includes("16:9") ? "16:9" : ratios[0];

    const resolutions = capability.resolutions.map(normalizeResolutionToken);
    const draft = capability.draft && config.videoDraft === "true";
    const resolution = normalizeResolutionToken(config.vquality);
    const forcedDraftResolution = draft && resolutions.includes("480p") ? "480p" : undefined;
    if (forcedDraftResolution && resolution !== forcedDraftResolution) patch.vquality = forcedDraftResolution;
    else if (resolutions.length && !resolutions.includes(resolution)) patch.vquality = resolutions[0];

    const seconds = Number(config.videoSeconds);
    if (capability.durations.length && !capability.durations.includes(seconds)) patch.seconds = String(capability.durations[0]);

    const count = Number(config.count);
    if (capability.counts.length && !capability.counts.includes(count)) patch.count = capability.counts[0];

    if (!capability.generateAudio && config.videoGenerateAudio !== "false") patch.generateAudio = "false";
    if (!capability.watermark && config.videoWatermark !== "false") patch.watermark = "false";
    if (!capability.draft && config.videoDraft !== "false") patch.draft = "false";
    return patch;
}
