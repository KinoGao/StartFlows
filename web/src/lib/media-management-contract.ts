import type { LocalMediaType, ManagedMediaType } from "@/lib/local-media-storage-contract";

export const managedMediaTypeOptions: Array<{ value: ManagedMediaType | ""; label: string }> = [
    { value: "", label: "全部" },
    { value: "image", label: "图片" },
    { value: "video", label: "视频" },
    { value: "audio", label: "音频" },
    { value: "attachment", label: "附件" },
];

export const mediaSourceGroupOptions = [
    { value: "", label: "全部入口" },
    { value: "agent", label: "Agent 工作台" },
    { value: "image-workbench", label: "图片生成" },
    { value: "video-workbench", label: "视频生成" },
    { value: "canvas", label: "Canvas" },
    { value: "drama", label: "短剧" },
    { value: "upload", label: "用户上传" },
    { value: "other", label: "其他来源" },
] as const;

export type MediaSourceGroup = (typeof mediaSourceGroupOptions)[number]["value"];

export function isManagedMediaType(value: unknown): value is ManagedMediaType {
    return value === "image" || value === "video" || value === "audio" || value === "attachment";
}

export function isMediaSourceGroup(value: unknown): value is Exclude<MediaSourceGroup, ""> {
    return value === "agent" || value === "image-workbench" || value === "video-workbench" || value === "canvas" || value === "drama" || value === "upload" || value === "other";
}

const imageExtensions = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif", "bmp", "tif", "tiff", "svg"]);
const videoExtensions = new Set(["mp4", "webm", "mov", "m4v", "avi", "mkv"]);
const audioExtensions = new Set(["mp3", "wav", "ogg", "opus", "aac", "flac", "m4a"]);

export function classifyManagedMediaType(input: { type?: LocalMediaType; mimeType?: string; name?: string }): ManagedMediaType {
    if (input.type) return input.type;
    const mimeType = (input.mimeType || "").toLowerCase();
    if (mimeType.startsWith("image/")) return "image";
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    const extension = (input.name || "").toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] || "";
    if (imageExtensions.has(extension)) return "image";
    if (videoExtensions.has(extension)) return "video";
    if (audioExtensions.has(extension)) return "audio";
    return "attachment";
}

export function managedMediaTypeLabel(type: ManagedMediaType) {
    return type === "image" ? "图片" : type === "video" ? "视频" : type === "audio" ? "音频" : "附件";
}

export function mediaSourceGroup(source?: string): Exclude<MediaSourceGroup, ""> {
    const value = (source || "").trim().toLowerCase();
    if (value === "agent") return "agent";
    if (value === "image-workbench" || value === "image-task" || value === "image-task-reference") return "image-workbench";
    if (value === "video-workbench" || value === "video-task") return "video-workbench";
    if (value === "canvas") return "canvas";
    if (value === "drama" || value === "drama-render") return "drama";
    if (value === "user-upload" || value === "creative-upload") return "upload";
    return "other";
}

export function mediaTaskSource(source: unknown, context: { surface?: string; clientRequestId?: string } | undefined, fallback: string) {
    const explicit = typeof source === "string" ? source.trim().toLowerCase() : "";
    if (["agent", "image-workbench", "video-workbench", "canvas", "drama"].includes(explicit)) return explicit;
    if (context?.surface === "canvas" || context?.surface === "drama") return context.surface;
    if (context?.surface === "chat") {
        if (context.clientRequestId?.startsWith("image-workbench")) return "image-workbench";
        if (context.clientRequestId?.startsWith("video-workbench")) return "video-workbench";
        return "agent";
    }
    return fallback;
}

export function mediaSourceLabel(source?: string) {
    const labels: Record<string, string> = {
        agent: "Agent 工作台",
        "image-workbench": "图片生成",
        "image-task": "图片生成任务",
        "image-task-reference": "图片任务参考图",
        "video-workbench": "视频生成",
        "video-task": "视频生成任务",
        "audio-task": "音频生成任务",
        canvas: "Canvas",
        drama: "短剧项目",
        "drama-render": "短剧整集合成",
        "user-upload": "用户上传",
        "creative-upload": "创作会话上传",
    };
    return source ? labels[source] || source : "未登记来源";
}
