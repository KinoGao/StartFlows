import { CanvasNodeType, type CanvasGenerationMode } from "./types";
import type { CanvasNodeMetadata } from "./types";
import { createDefaultCanvasNodeMetadata } from "./utils/canvas-node-metadata";

type CanvasNodeSpec = {
    width: number;
    height: number;
    title: string;
    metadata?: CanvasNodeMetadata;
};

export const NODE_DEFAULT_SIZE = {
    [CanvasNodeType.Image]: { width: 384, height: 216, title: "New Generation" },
    [CanvasNodeType.Text]: { width: 384, height: 216, title: "Note" },
    [CanvasNodeType.Config]: { width: 420, height: 240, title: "生成配置" },
    [CanvasNodeType.ComfyUI]: { width: 384, height: 216, title: "ComfyUI" },
    [CanvasNodeType.Video]: { width: 384, height: 216, title: "Video" },
    [CanvasNodeType.Audio]: { width: 220, height: 96, title: "Audio" },
    [CanvasNodeType.Group]: { width: 360, height: 260, title: "分组" },
} satisfies Record<CanvasNodeType, { width: number; height: number; title: string }>;

export function getConfigNodeHeight(mode?: CanvasGenerationMode) {
    if (mode === "comfyui") return NODE_DEFAULT_SIZE[CanvasNodeType.ComfyUI].height;
    return mode === "video" ? 344 : NODE_DEFAULT_SIZE[CanvasNodeType.Config].height;
}

export const NODE_SPECS = {
    [CanvasNodeType.Image]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Image],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.Image),
    },
    [CanvasNodeType.Text]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Text],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.Text),
    },
    [CanvasNodeType.Config]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Config],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.Config),
    },
    [CanvasNodeType.ComfyUI]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.ComfyUI],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.ComfyUI),
    },
    [CanvasNodeType.Video]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Video],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.Video),
    },
    [CanvasNodeType.Audio]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Audio],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.Audio),
    },
    [CanvasNodeType.Group]: {
        ...NODE_DEFAULT_SIZE[CanvasNodeType.Group],
        metadata: createDefaultCanvasNodeMetadata(CanvasNodeType.Group),
    },
} satisfies Record<CanvasNodeType, CanvasNodeSpec>;

export function getNodeSpec(type: CanvasNodeType) {
    return NODE_SPECS[type];
}
