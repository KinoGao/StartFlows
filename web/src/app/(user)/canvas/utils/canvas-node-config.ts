import { defaultConfig, modelOptionName, selectableModelsByCapability, type AiConfig } from "@/stores/use-config-store";
import type { CanvasAudioSettingKey } from "../components/canvas-audio-settings-popover";
import type { CanvasGenerationMode, CanvasNodeData } from "../types";

export function buildCanvasNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasGenerationMode, model: string): AiConfig {
    return {
        ...globalConfig,
        model,
        quality: node.metadata?.quality || globalConfig.quality || defaultConfig.quality,
        size: node.metadata?.size || globalConfig.size || defaultConfig.size,
        videoSeconds: node.metadata?.seconds || globalConfig.videoSeconds || defaultConfig.videoSeconds,
        vquality: node.metadata?.vquality || globalConfig.vquality || defaultConfig.vquality,
        videoGenerateAudio: node.metadata?.generateAudio || globalConfig.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node.metadata?.watermark || globalConfig.videoWatermark || defaultConfig.videoWatermark,
        audioVoice: node.metadata?.audioVoice || globalConfig.audioVoice || defaultConfig.audioVoice,
        audioFormat: node.metadata?.audioFormat || globalConfig.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node.metadata?.audioSpeed || globalConfig.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: node.metadata?.audioInstructions || defaultConfig.audioInstructions,
        count: String(node.metadata?.count || (mode === "image" ? globalConfig.canvasImageCount || globalConfig.count : globalConfig.count) || defaultConfig.count),
    };
}

export function resolveCanvasGenerationModel(config: AiConfig, mode: CanvasGenerationMode, currentModel = "") {
    const models = selectableModelsByCapability(config, mode);
    const current = findModelOption(models, currentModel);
    if (current) return current;
    const preferred = mode === "image" ? config.imageModel : mode === "video" ? config.videoModel : mode === "audio" ? config.audioModel : config.textModel;
    return findModelOption(models, preferred) || models[0] || "";
}

function findModelOption(options: string[], value: string) {
    const normalized = modelOptionName(value).trim().toLowerCase();
    return normalized ? options.find((option) => modelOptionName(option).trim().toLowerCase() === normalized) || "" : "";
}

export function canvasVideoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoWatermark") return { watermark: value };
    return { [key]: value };
}

export function canvasAudioConfigPatch(key: CanvasAudioSettingKey, value: string) {
    if (key === "audioVoice") return { audioVoice: value };
    if (key === "audioFormat") return { audioFormat: value };
    if (key === "audioSpeed") return { audioSpeed: value };
    return { audioInstructions: value };
}
