import { CanvasNodeType, type CanvasNodeMetadata } from "../types";

export function createDefaultCanvasNodeMetadata(type: CanvasNodeType): CanvasNodeMetadata {
    const base: CanvasNodeMetadata = { content: "", status: "idle" };

    if (type === CanvasNodeType.Text) return { ...base, fontSize: 14 };
    if (type === CanvasNodeType.Image) return { ...base, size: "16:9" };
    if (type === CanvasNodeType.Config) return { ...base, generationMode: "image" };
    if (type === CanvasNodeType.ComfyUI) return { ...base, generationMode: "comfyui", comfyCapability: "text-to-text" };

    return base;
}

export function createGenerationMetadata(metadata: CanvasNodeMetadata): CanvasNodeMetadata {
    return {
        generationMode: metadata.generationMode,
        generationType: metadata.generationType,
        model: metadata.model,
        size: metadata.size,
        quality: metadata.quality,
        resolution: metadata.resolution,
        count: metadata.count,
        seconds: metadata.seconds,
        vquality: metadata.vquality,
        generateAudio: metadata.generateAudio,
        watermark: metadata.watermark,
        generationJobId: metadata.generationJobId,
        audioVoice: metadata.audioVoice,
        audioFormat: metadata.audioFormat,
        audioSpeed: metadata.audioSpeed,
        audioInstructions: metadata.audioInstructions,
        comfyWorkflowId: metadata.comfyWorkflowId,
        comfyFieldValues: metadata.comfyFieldValues,
        references: metadata.references,
    };
}

export function createMediaMetadata(metadata: CanvasNodeMetadata): CanvasNodeMetadata {
    return {
        content: metadata.content,
        naturalWidth: metadata.naturalWidth,
        naturalHeight: metadata.naturalHeight,
        storageKey: metadata.storageKey,
        mimeType: metadata.mimeType,
        bytes: metadata.bytes,
        durationMs: metadata.durationMs,
    };
}

export function createDirectorMetadataPatch(metadata: CanvasNodeMetadata): CanvasNodeMetadata {
    return {
        canvasTool: metadata.canvasTool,
        directorProject: metadata.directorProject,


        directorOutputIds: metadata.directorOutputIds,
    };
}
