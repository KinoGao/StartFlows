import { resolveModelRequestConfig, type AiConfig } from "@/flowcanvas/stores/use-config-store";
import type { ReferenceImage } from "@/flowcanvas/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/flowcanvas/types/media";

export const SEEDANCE_REFERENCE_LIMITS = {
    images: 9,
    videos: 3,
    audios: 3,
    imageMaxBytes: 30 * 1024 * 1024,
    videoMaxBytes: 200 * 1024 * 1024,
    audioMaxBytes: 15 * 1024 * 1024,
};

export const seedanceResolutionOptions = [
    { value: "480p", label: "480p" },
    { value: "720p", label: "720p" },
    { value: "1080p", label: "1080p" },
    { value: "4k", label: "4K" },
] as const;

export const seedanceRatioOptions = [
    { value: "16:9", label: "横屏" },
    { value: "9:16", label: "竖屏" },
    { value: "1:1", label: "方形" },
    { value: "4:3", label: "标准横屏" },
    { value: "3:4", label: "标准竖屏" },
    { value: "21:9", label: "宽银幕" },
    { value: "adaptive", label: "自适应" },
] as const;

export const seedanceDurationOptions = [-1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;
type SeedanceResolution = (typeof seedanceResolutionOptions)[number]["value"];
type SeedanceMode = "t2v" | "i2v_first" | "i2v_first_tail" | "reference";
type SeedanceGenerationMode = "text-to-video" | "all-in-one-reference" | "image-to-video" | "first-last-frame";

export type SeedanceCapabilities = {
    modes: SeedanceGenerationMode[];
    ratios: string[];
    durations: number[];
    watermark: boolean;
    draft: boolean;
    maxImages: number;
    maxVideos: number;
    maxAudios: number;
    textToVideo: boolean;
    imageToVideoFirst: boolean;
    imageToVideoFirstLast: boolean;
    inputVideo: boolean;
    inputAudio: boolean;
    generateAudio: boolean;
    resolutions: SeedanceResolution[];
};

const seedanceRatios = ["adaptive", "16:9", "9:16", "1:1", "4:3", "3:4", "21:9"];
const seedance10Durations = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const seedance15Durations = [-1, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const seedance20Durations = [-1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];

const seedancePixels = {
    "480p": {
        "16:9": "864x496",
        "4:3": "752x560",
        "1:1": "640x640",
        "3:4": "560x752",
        "9:16": "496x864",
        "21:9": "992x432",
    },
    "720p": {
        "16:9": "1280x720",
        "4:3": "1112x834",
        "1:1": "960x960",
        "3:4": "834x1112",
        "9:16": "720x1280",
        "21:9": "1470x630",
    },
    "1080p": {
        "16:9": "1920x1080",
        "4:3": "1664x1248",
        "1:1": "1440x1440",
        "3:4": "1248x1664",
        "9:16": "1080x1920",
        "21:9": "2206x946",
    },
    "4k": {
        "16:9": "3840x2160",
        "4:3": "3326x2494",
        "1:1": "2880x2880",
        "3:4": "2494x3326",
        "9:16": "2160x3840",
        "21:9": "4398x1886",
    },
} as const;

export function isSeedanceVideoModel(model: string) {
    const value = model.toLowerCase();
    return value.includes("seedance") || value.includes("doubao-seedance");
}

export function isSeedanceNewModel(model: string) {
    const value = model.toLowerCase();
    // 1.5+ additionally supports newer controls such as generate_audio and smart duration.
    return /(?:^|[^0-9])(?:1[.-]5|2[.-]0)(?:[^0-9]|$)/.test(value);
}

export function isSeedanceFastModel(model: string) {
    const value = model.toLowerCase();
    return isSeedanceVideoModel(value) && value.includes("fast");
}

function normalizedSeedanceModel(model: string) {
    return model.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function seedanceGenerationMode(images: ReferenceImage[], videos: ReferenceVideo[], audios: ReferenceAudio[]): SeedanceMode {
    if (videos.length || audios.length || images.length > 2) return "reference";
    if (images.length >= 2) return "i2v_first_tail";
    if (images.length === 1) return "i2v_first";
    return "t2v";
}

export function seedanceCapabilitiesForModel(model: string): SeedanceCapabilities {
    const value = normalizedSeedanceModel(model);
    const capability = (overrides: Partial<SeedanceCapabilities>): SeedanceCapabilities => ({
        modes: ["text-to-video", "image-to-video"],
        ratios: [...seedanceRatios],
        durations: [...seedance10Durations],
        watermark: false,
        draft: false,
        maxImages: 1,
        maxVideos: 0,
        maxAudios: 0,
        textToVideo: true,
        imageToVideoFirst: true,
        imageToVideoFirstLast: false,
        inputVideo: false,
        inputAudio: false,
        generateAudio: false,
        resolutions: ["480p", "720p"],
        ...overrides,
    });
    if (value.includes("2-0-fast") || value.includes("2-0-mini")) {
        return capability({
            modes: ["text-to-video", "all-in-one-reference", "image-to-video", "first-last-frame"],
            durations: [...seedance20Durations],
            watermark: true,
            maxImages: 9,
            maxVideos: 3,
            maxAudios: 3,
            imageToVideoFirstLast: true,
            inputVideo: true,
            inputAudio: true,
            generateAudio: true,
        });
    }
    if (value.includes("2-0")) {
        return capability({
            modes: ["text-to-video", "all-in-one-reference", "image-to-video", "first-last-frame"],
            durations: [...seedance20Durations],
            watermark: true,
            maxImages: 9,
            maxVideos: 3,
            maxAudios: 3,
            imageToVideoFirstLast: true,
            inputVideo: true,
            inputAudio: true,
            generateAudio: true,
            resolutions: ["480p", "720p", "1080p", "4k"],
        });
    }
    if (value.includes("1-5")) {
        return capability({
            modes: ["text-to-video", "image-to-video", "first-last-frame"],
            durations: [...seedance15Durations],
            watermark: true,
            draft: true,
            maxImages: 2,
            imageToVideoFirstLast: true,
            generateAudio: true,
            resolutions: ["480p", "720p", "1080p"],
        });
    }
    if (value.includes("1-0-pro-fast")) {
        return capability({ watermark: true, resolutions: ["480p", "720p", "1080p"] });
    }
    if (value.includes("1-0-pro")) {
        return capability({
            modes: ["text-to-video", "image-to-video", "first-last-frame"],
            watermark: true,
            maxImages: 2,
            imageToVideoFirstLast: true,
            resolutions: ["480p", "720p", "1080p"],
        });
    }
    if (value.includes("lite-t2v")) {
        return capability({ modes: ["text-to-video"], watermark: true, maxImages: 0, imageToVideoFirst: false, resolutions: ["480p", "720p", "1080p"] });
    }
    if (value.includes("lite-i2v")) {
        return capability({ modes: ["image-to-video"], watermark: true, textToVideo: false, resolutions: ["480p", "720p", "1080p"] });
    }
    if (value.includes("seaweed")) {
        return capability({ modes: ["text-to-video"], maxImages: 0, imageToVideoFirst: false });
    }
    return capability({});
}

export function seedanceCapabilityError(model: string, images: ReferenceImage[], videos: ReferenceVideo[], audios: ReferenceAudio[]) {
    const capabilities = seedanceCapabilitiesForModel(model);
    const mode = seedanceGenerationMode(images, videos, audios);
    if (images.length > capabilities.maxImages) return `当前 Seedance 模型最多支持 ${capabilities.maxImages} 张参考图片`;
    if (videos.length > capabilities.maxVideos) return `当前 Seedance 模型最多支持 ${capabilities.maxVideos} 个参考视频`;
    if (audios.length > capabilities.maxAudios) return `当前 Seedance 模型最多支持 ${capabilities.maxAudios} 个参考音频`;
    if (videos.length && !capabilities.inputVideo) return "当前 Seedance 模型不支持参考视频输入，请移除参考视频";
    if (audios.length && !capabilities.inputAudio) return "当前 Seedance 模型不支持参考音频输入，请切换到 Seedance 2.0 系列";
    if (audios.length && !images.length && !videos.length) return "Seedance 参考音频不能单独使用，请同时连接参考图片或参考视频";
    if (mode === "reference" && !capabilities.modes.includes("all-in-one-reference")) return "当前 Seedance 模型不支持多模态参考，请减少参考素材或切换到 Seedance 2.0 系列";
    if (mode === "t2v" && !capabilities.textToVideo) return "当前 Seedance 模型不支持文生视频，请添加一张参考图或切换到 t2v/pro 模型";
    if (mode === "i2v_first" && !capabilities.imageToVideoFirst) return "当前 Seedance 模型不支持首帧图生视频，请移除参考图或切换到 i2v/pro 模型";
    if (mode === "i2v_first_tail" && !capabilities.imageToVideoFirstLast) return "当前 Seedance 模型不支持首尾帧图生视频，请只保留一张参考图或切换到支持首尾帧的模型";
    return "";
}

export function seedanceSupportsGenerateAudio(model: string) {
    return seedanceCapabilitiesForModel(model).generateAudio;
}

export function isAgnesVideoModel(model: string) {
    const value = model.toLowerCase();
    return value.startsWith("agnes-video") || value.startsWith("agnesvideo") || value.includes("agnes-video");
}

export function isAgnesVideoConfig(config: AiConfig | Pick<AiConfig, "model" | "videoModel" | "baseUrl">) {
    const requestConfig = "channels" in config ? resolveModelRequestConfig(config, config.model || config.videoModel) : config;
    return isAgnesVideoModel(requestConfig.model || requestConfig.videoModel);
}

export function normalizeSeedanceResolution(value: string, model = "") {
    const normalized = normalizeResolutionToken(value);
    const supported = seedanceCapabilitiesForModel(model).resolutions;
    if (supported.includes(normalized as SeedanceResolution)) return normalized;
    return supported.includes("720p") ? "720p" : supported[0] || "720p";
}

export function normalizeResolutionToken(value: string) {
    if (value === "low") return "480p";
    if (value === "auto" || value === "high" || value === "medium") return "720p";
    const token = String(value || "").trim().toLowerCase();
    if (token === "4k" || token === "4kp") return "4k";
    const resolution = token.replace(/p$/i, "") || "720";
    return `${resolution}p`;
}

export function normalizeSeedanceDuration(value: string) {
    if (String(value).trim() === "-1") return -1;
    const seconds = Number(value);
    return Number.isInteger(seconds) ? seconds : 5;
}

export function normalizeSeedanceRatio(value: string) {
    if (!value || value === "auto" || value === "adaptive") return "adaptive";
    if (seedanceRatioOptions.some((item) => item.value === value)) return value;
    const match = value.match(/^(\d+)x(\d+)$/);
    if (!match) return "adaptive";
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (!width || !height) return "adaptive";
    const ratio = width / height;
    const options = [
        ["16:9", 16 / 9],
        ["4:3", 4 / 3],
        ["1:1", 1],
        ["3:4", 3 / 4],
        ["9:16", 9 / 16],
        ["21:9", 21 / 9],
    ] as const;
    return options.reduce((best, item) => (Math.abs(item[1] - ratio) < Math.abs(best[1] - ratio) ? item : best), options[0])[0];
}

export function seedancePixelLabel(resolution: string, ratio: string) {
    const normalizedResolution = normalizeSeedanceResolution(resolution) as keyof typeof seedancePixels;
    const normalizedRatio = normalizeSeedanceRatio(ratio) as keyof (typeof seedancePixels)[typeof normalizedResolution] | "adaptive";
    if (normalizedRatio === "adaptive") return "自动匹配";
    return seedancePixels[normalizedResolution][normalizedRatio] || "";
}

export function boolConfig(value: string | undefined, fallback: boolean) {
    if (value === "true") return true;
    if (value === "false") return false;
    return fallback;
}

export function seedanceReferenceLabel(kind: "image" | "video" | "audio", index: number) {
    if (kind === "image") return `图片${index + 1}`;
    if (kind === "video") return `视频${index + 1}`;
    return `音频${index + 1}`;
}

export function buildSeedancePromptText(prompt: string, images: ReferenceImage[], videos: ReferenceVideo[], audios: ReferenceAudio[]) {
    const labels = [...images.map((_, index) => seedanceReferenceLabel("image", index)), ...videos.map((_, index) => seedanceReferenceLabel("video", index)), ...audios.map((_, index) => seedanceReferenceLabel("audio", index))];
    const text = prompt.trim();
    if (!labels.length) return text;
    return `参考素材编号：${labels.join("、")}。请按这些编号理解提示词中的图片、视频和音频引用。\n\n${text}`;
}

export function seedanceVideoReferenceError(videos: ReferenceVideo[]) {
    let totalDurationMs = 0;
    for (let index = 0; index < videos.length; index += 1) {
        const video = videos[index];
        const label = seedanceReferenceLabel("video", index);
        if (video.bytes && video.bytes > SEEDANCE_REFERENCE_LIMITS.videoMaxBytes) return `${label} 超过 200MB，请压缩后再上传`;
        if (video.durationMs) {
            if (video.durationMs < 2000 || video.durationMs > 15000) return `${label} 时长需要在 2-15 秒之间`;
            totalDurationMs += video.durationMs;
        }
        if (video.width && video.height) {
            if (video.width < 300 || video.width > 6000 || video.height < 300 || video.height > 6000) return `${label} 宽高需要在 300-6000px 之间`;
            const ratio = video.width / video.height;
            if (ratio < 0.4 || ratio > 2.5) return `${label} 宽高比需要在 0.4-2.5 之间`;
            const pixels = video.width * video.height;
            if (pixels < 640 * 640 || pixels > 3326 * 2494) return `${label} 像素总量不符合 Seedance 要求，请调整到官方支持范围后再上传`;
        }
    }
    if (totalDurationMs > 15000) return "Seedance 参考视频总时长不能超过 15 秒";
    return "";
}

export const seedanceVideoReferenceHint = "参考视频需为 mp4/mov，H.264/H.265，FPS 24-60；含真人人脸素材请使用火山授权 asset:// 素材。";
