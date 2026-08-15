import { modelOptionName } from "@/flowcanvas/stores/use-config-store";

export type SeedreamResolution = "adaptive" | "1K" | "2K" | "3K" | "4K";

type SeedreamCapabilities = {
    textToImage: boolean;
    imageEdit: boolean;
    maxImages: number;
    resolutions: SeedreamResolution[];
    outputFormat: boolean;
};

function normalizedSeedreamModel(model: string) {
    return modelOptionName(model)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-");
}

export function isSeedreamImageModel(model: string) {
    const value = normalizedSeedreamModel(model);
    return value.includes("seedream") || value.includes("seededit");
}

export function isSeedEditImageModel(model: string) {
    return normalizedSeedreamModel(model).includes("seededit");
}

export function seedreamCapabilitiesForModel(model: string): SeedreamCapabilities {
    const value = normalizedSeedreamModel(model);
    if (value.includes("seededit")) return { textToImage: false, imageEdit: true, maxImages: 1, resolutions: ["adaptive", "1K", "2K", "4K"], outputFormat: false };
    if (value.includes("5-0-pro")) return { textToImage: true, imageEdit: true, maxImages: 10, resolutions: ["1K", "2K"], outputFormat: true };
    if (value.includes("5-0-lite")) return { textToImage: true, imageEdit: true, maxImages: 14, resolutions: ["2K", "3K", "4K"], outputFormat: true };
    if (value.includes("4-5")) return { textToImage: true, imageEdit: true, maxImages: 14, resolutions: ["2K", "4K"], outputFormat: false };
    if (value.includes("4-0")) return { textToImage: true, imageEdit: true, maxImages: 14, resolutions: ["1K", "2K", "4K"], outputFormat: false };
    if (value.includes("3-0-t2i")) return { textToImage: true, imageEdit: false, maxImages: 0, resolutions: ["1K", "2K"], outputFormat: false };
    return { textToImage: true, imageEdit: false, maxImages: 0, resolutions: ["2K"], outputFormat: false };
}

export function seedreamGenerationError(model: string, imageCount = 0) {
    const capabilities = seedreamCapabilitiesForModel(model);
    if (!imageCount && !capabilities.textToImage) return "当前 Seedream/SeedEdit 模型不支持纯文生图，请连接参考图后使用图生图/编辑";
    if (imageCount) return seedreamEditError(model, imageCount);
    return "";
}

export function seedreamEditError(model: string, imageCount = 1) {
    const capabilities = seedreamCapabilitiesForModel(model);
    if (!capabilities.imageEdit) return "当前 Seedream 模型不支持图生图/编辑，请切换到 SeedEdit 或支持参考图的 Seedream 模型";
    if (imageCount > capabilities.maxImages) return `当前 Seedream 模型最多支持 ${capabilities.maxImages} 张参考图，请减少参考图数量`;
    return "";
}

export function seedreamSupportsOutputFormat(model: string) {
    return seedreamCapabilitiesForModel(model).outputFormat;
}

export function resolveSeedreamSize(model: string, quality: string | undefined, size: string) {
    const value = String(size || "").trim();
    if (/^\d+x\d+$/i.test(value)) return value;
    const capabilities = seedreamCapabilitiesForModel(model);
    if ((value === "auto" || value === "adaptive") && capabilities.resolutions.includes("adaptive")) return "adaptive";
    const requested = requestedResolution(quality, value);
    if (capabilities.resolutions.includes(requested)) return requested;
    if (capabilities.resolutions.includes("2K")) return "2K";
    return capabilities.resolutions[0] || "2K";
}

function requestedResolution(quality: string | undefined, size: string): SeedreamResolution {
    const text = `${quality || ""} ${size || ""}`.toLowerCase();
    if (text.includes("4k") || text.includes("high")) return "4K";
    if (text.includes("3k")) return "3K";
    if (text.includes("1k") || text.includes("low")) return "1K";
    return "2K";
}
