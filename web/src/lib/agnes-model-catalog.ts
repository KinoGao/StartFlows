import type { ModelCatalogEntry } from "@/lib/model-capability";
import type { SystemChannelModelConfig } from "@/lib/auth/store-types";

const AGNES_MODELS: ModelCatalogEntry[] = [
    { id: "agnes-2.0-flash", capability: "text", source: "official" },
    { id: "agnes-image-2.0-flash", capability: "image", source: "official" },
    { id: "agnes-image-2.1-flash", capability: "image", source: "official" },
    { id: "agnes-video-v2.0", capability: "video", source: "official" },
];

export const AGNES_RECOMMENDED_CONFIG = {
    textModel: "agnes-2.0-flash",
    imageModel: "agnes-image-2.1-flash",
    videoModel: "agnes-video-v2.0",
} as const;

export const AGNES_MODEL_CONFIGS: Record<string, SystemChannelModelConfig> = {
    "agnes-2.0-flash": { capability: "text", source: "official", apiFormat: "openai", protocol: "openai" },
    "agnes-image-2.0-flash": { capability: "image", source: "official", apiFormat: "openai", protocol: "openai", createPath: "/images/generations" },
    "agnes-image-2.1-flash": { capability: "image", source: "official", apiFormat: "openai", protocol: "openai", createPath: "/images/generations" },
    "agnes-video-v2.0": { capability: "video", source: "official", apiFormat: "openai", protocol: "compatible", createPath: "/videos", queryPath: "/agnesapi?video_id=:task_id" },
};

export function isAgnesApiBaseUrl(baseUrl: string) {
    try {
        const hostname = new URL(baseUrl).hostname.toLowerCase();
        return hostname === "agnes-ai.com" || hostname.endsWith(".agnes-ai.com");
    } catch {
        return false;
    }
}

export function agnesModelCatalog(baseUrl: string) {
    return isAgnesApiBaseUrl(baseUrl) ? AGNES_MODELS.map((entry) => ({ ...entry })) : [];
}

export function agnesModelConfigs(baseUrl: string) {
    return isAgnesApiBaseUrl(baseUrl) ? structuredClone(AGNES_MODEL_CONFIGS) : {};
}
