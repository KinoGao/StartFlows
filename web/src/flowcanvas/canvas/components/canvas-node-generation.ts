import type { AiTextMessage } from "@/flowcanvas/services/api/image";
import { imageReferenceLabel } from "@/flowcanvas/lib/image-reference-prompt";
import { normalizeSeedanceRatio, seedanceReferenceLabel } from "@/flowcanvas/lib/seedance-video";
import type { ReferenceImage } from "@/flowcanvas/types/image";
import type { ReferenceAudio, ReferenceVideo } from "@/flowcanvas/types/media";
import { CanvasNodeType, type CanvasConnection, type CanvasGenerationMode, type CanvasNodeData } from "../types";
import { getGenerationResourceNodes, type CanvasResourceGraph } from "../utils/canvas-resource-references";

export type NodeGenerationContext = {
    prompt: string;
    inputs: NodeGenerationInput[];
    referenceImages: ReferenceImage[];
    referenceVideos: ReferenceVideo[];
    referenceAudios: ReferenceAudio[];
    textCount: number;
    imageCount: number;
    videoCount: number;
    audioCount: number;
};

export type NodeGenerationInput = {
    nodeId: string;
    type: "text" | "image" | "video" | "audio";
    title: string;
    text?: string;
    image?: ReferenceImage;
    video?: ReferenceVideo;
    audio?: ReferenceAudio;
};

type NodeGenerationBuildOptions = { appendUpstreamText?: boolean };

export function buildNodeGenerationContext(nodeId: string, graph: CanvasResourceGraph, prompt: string, options?: NodeGenerationBuildOptions): NodeGenerationContext;
export function buildNodeGenerationContext(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[], prompt: string, options?: NodeGenerationBuildOptions): NodeGenerationContext;
export function buildNodeGenerationContext(
    nodeId: string,
    source: CanvasResourceGraph | CanvasNodeData[],
    connectionsOrPrompt: CanvasConnection[] | string,
    promptOrOptions?: string | NodeGenerationBuildOptions,
    maybeOptions?: NodeGenerationBuildOptions,
): NodeGenerationContext {
    const graph = Array.isArray(source) ? null : source;
    const nodes = Array.isArray(source) ? source : [];
    const connections = Array.isArray(connectionsOrPrompt) ? connectionsOrPrompt : [];
    const prompt = Array.isArray(source) ? (promptOrOptions as string) : (connectionsOrPrompt as string);
    const options = Array.isArray(source) ? maybeOptions : (promptOrOptions as NodeGenerationBuildOptions | undefined);
    const appendUpstreamText = options?.appendUpstreamText ?? true;
    const inputs = graph ? buildNodeGenerationInputs(nodeId, graph) : buildNodeGenerationInputs(nodeId, nodes, connections);
    const sourceNode = graph ? graph.nodeById.get(nodeId) : nodes.find((node) => node.id === nodeId);
    if (isGenerationConfigNode(sourceNode?.type) && Boolean(sourceNode.metadata?.composerContent?.trim())) {
        return buildComposerGenerationContext(inputs, prompt);
    }

    const mentionContext = buildMentionLabelGenerationContext(inputs, prompt);
    if (mentionContext) return mentionContext;

    const upstreamText = appendUpstreamText
        ? inputs
              .map((input) => input.text)
              .filter(Boolean)
              .join("\n\n")
        : "";
    const referenceImages = inputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
    const referenceVideos = inputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
    const referenceAudios = inputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));

    return {
        prompt: upstreamText ? `${prompt}\n\n${upstreamText}` : prompt,
        inputs,
        referenceImages,
        referenceVideos,
        referenceAudios,
        textCount: inputs.filter((input) => input.type === "text").length,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
    };
}

function isGenerationConfigNode(type: CanvasNodeType | undefined) {
    return type === CanvasNodeType.Config || type === CanvasNodeType.ComfyUI;
}

function buildMentionLabelGenerationContext(inputs: NodeGenerationInput[], prompt: string): NodeGenerationContext | null {
    const counts = { image: 0, video: 0, audio: 0, text: 0 };
    const labeledInputs = inputs.map((input) => ({ input, label: generationLabel(input.type, counts[input.type]++) }));
    const selectedInputs: NodeGenerationInput[] = [];
    const textBlocks: string[] = [];
    let nextPrompt = prompt;
    let hasLabel = false;

    labeledInputs
        .sort((a, b) => b.label.length - a.label.length)
        .forEach(({ input, label }) => {
            if (!hasLabelToken(nextPrompt, label)) return;
            hasLabel = true;
            nextPrompt = replaceLabelToken(nextPrompt, label, input.type === "text" ? "" : label);
            if (input.type === "text") {
                textBlocks.push(`【${label}】\n${input.text || ""}`);
            } else {
                selectedInputs.push(input);
            }
        });

    if (!hasLabel) return null;
    if (textBlocks.length) nextPrompt = appendTextBlocks(nextPrompt, textBlocks);
    const referenceImages = selectedInputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
    const referenceVideos = selectedInputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
    const referenceAudios = selectedInputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));

    return {
        prompt: nextPrompt,
        inputs,
        referenceImages,
        referenceVideos,
        referenceAudios,
        textCount: textBlocks.length,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
    };
}

function buildComposerGenerationContext(inputs: NodeGenerationInput[], prompt: string): NodeGenerationContext {
    const inputByNodeId = new Map(inputs.map((input) => [input.nodeId, input]));
    const selectedInputs: NodeGenerationInput[] = [];
    const labelByNodeId = new Map<string, string>();
    const textBlocks: string[] = [];
    const counts = { image: 0, video: 0, audio: 0, text: 0 };
    let hasToken = false;
    let lastIndex = 0;
    let nextPrompt = "";

    for (const match of prompt.matchAll(/@\[node:([^\]]+)\]/g)) {
        if (match.index === undefined) continue;
        hasToken = true;
        nextPrompt += prompt.slice(lastIndex, match.index);
        const input = inputByNodeId.get(match[1]);
        if (input) {
            let label = labelByNodeId.get(input.nodeId);
            if (!label) {
                label = generationLabel(input.type, counts[input.type]++);
                labelByNodeId.set(input.nodeId, label);
                if (input.type === "text") textBlocks.push(`【${label}】\n${input.text || ""}`);
                else selectedInputs.push(input);
            }
            if (input.type !== "text") nextPrompt += label;
        }
        lastIndex = match.index + match[0].length;
    }

    nextPrompt += prompt.slice(lastIndex);
    if (textBlocks.length) nextPrompt = appendTextBlocks(nextPrompt, textBlocks);
    const referenceImages = selectedInputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
    const referenceVideos = selectedInputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
    const referenceAudios = selectedInputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));

    if (!hasToken) {
        const referenceImages = inputs.map((input) => input.image).filter((image): image is ReferenceImage => Boolean(image));
        const referenceVideos = inputs.map((input) => input.video).filter((video): video is ReferenceVideo => Boolean(video));
        const referenceAudios = inputs.map((input) => input.audio).filter((audio): audio is ReferenceAudio => Boolean(audio));
        const upstreamText = inputs.map((input) => input.text).filter(Boolean).join("\n\n");
        const basePrompt = upstreamText ? (prompt + "\n\n" + upstreamText) : prompt;
        if (referenceImages.length || referenceVideos.length || referenceAudios.length) {
            return {
                prompt: basePrompt,
                inputs,
                referenceImages,
                referenceVideos,
                referenceAudios,
                textCount: inputs.filter((input) => input.type === "text").length,
                imageCount: referenceImages.length,
                videoCount: referenceVideos.length,
                audioCount: referenceAudios.length,
            };
        }
        return {
            prompt: basePrompt,
            inputs,
            referenceImages: [],
            referenceVideos: [],
            referenceAudios: [],
            textCount: inputs.filter((input) => input.type === "text").length,
            imageCount: 0,
            videoCount: 0,
            audioCount: 0,
        };
    }

    return {
        prompt: nextPrompt,
        inputs,
        referenceImages,
        referenceVideos,
        referenceAudios,
        textCount: counts.text,
        imageCount: referenceImages.length,
        videoCount: referenceVideos.length,
        audioCount: referenceAudios.length,
    };
}

export function buildNodeGenerationInputs(nodeId: string, graph: CanvasResourceGraph): NodeGenerationInput[];
export function buildNodeGenerationInputs(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): NodeGenerationInput[];
export function buildNodeGenerationInputs(nodeId: string, source: CanvasResourceGraph | CanvasNodeData[], connections?: CanvasConnection[]): NodeGenerationInput[] {
    const resourceNodes = Array.isArray(source) ? getGenerationResourceNodes(nodeId, source, connections || []) : getGenerationResourceNodes(nodeId, source);
    return resourceNodes.flatMap((node): NodeGenerationInput[] => {
        const image = readReferenceImage(node);
        if (image) return [{ nodeId: node.id, type: "image" as const, title: node.title, image }];
        const video = readReferenceVideo(node);
        if (video) return [{ nodeId: node.id, type: "video" as const, title: node.title, video }];
        const audio = readReferenceAudio(node);
        if (audio) return [{ nodeId: node.id, type: "audio" as const, title: node.title, audio }];
        const text = readNodeTextInput(node);
        if (text) return [{ nodeId: node.id, type: "text" as const, title: node.title, text }];
        return [];
    });
}

export function buildNodeResponseMessages(context: NodeGenerationContext): AiTextMessage[] {
    if (!context.referenceImages.length) {
        return [{ role: "user", content: context.prompt }];
    }

    return [
        {
            role: "user",
            content: [{ type: "text" as const, text: context.prompt }, ...context.referenceImages.map((image) => ({ type: "image_url" as const, image_url: { url: image.dataUrl } }))],
        },
    ];
}

export async function hydrateNodeGenerationContext(context: NodeGenerationContext) {
    const { imageToDataUrl } = await import("@/flowcanvas/services/image-storage");
    const referenceImages = (
        await Promise.all(
            context.referenceImages.map(async (image) => {
                try {
                    return { ...image, dataUrl: await imageToDataUrl(image) };
                } catch {
                    return null;
                }
            }),
        )
    ).filter((image): image is ReferenceImage => Boolean(image));
    const imageById = new Map(referenceImages.map((image) => [image.id, image] as const));
    return {
        ...context,
        inputs: context.inputs.flatMap((input) => {
            if (!input.image) return [input];
            const image = imageById.get(input.image.id);
            return image ? [{ ...input, image }] : [];
        }),
        referenceImages,
        imageCount: referenceImages.length,
    };
}

function readNodeTextInput(node: CanvasNodeData) {
    // 脚本节点（canvasTool="script"）不参与上游文本输入：即使链接下游也不被引用。
    if (node.metadata?.canvasTool === "script") return "";
    if (node.type === CanvasNodeType.Text) return node.metadata?.content || node.metadata?.prompt || "";
    return node.metadata?.prompt || "";
}

function generationLabel(type: NodeGenerationInput["type"], index: number) {
    if (type === "image") return imageReferenceLabel(index);
    if (type === "video") return seedanceReferenceLabel("video", index);
    if (type === "audio") return seedanceReferenceLabel("audio", index);
    return `文本${index + 1}`;
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceLabelToken(value: string, label: string, replacement: string) {
    const escaped = escapeRegExp(label);
    return value.replace(new RegExp(`【${escaped}】`, "g"), replacement).replace(new RegExp(`(^|.)${escaped}(?![\\p{L}\\p{N}_】])`, "gu"), (_match, prefix: string) => `${prefix}${replacement}`);
}

function hasLabelToken(value: string, label: string) {
    const escaped = escapeRegExp(label);
    return new RegExp(`【${escaped}】|(^|.)${escaped}(?![\\p{L}\\p{N}_】])`, "u").test(value);
}

function appendTextBlocks(prompt: string, blocks: string[]) {
    const normalizedPrompt = prompt
        .replace(/[ \t]{2,}/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n[ \t]+/g, "\n")
        .trim();
    return [normalizedPrompt, blocks.join("\n\n")].filter(Boolean).join("\n\n");
}

function readReferenceImage(node: CanvasNodeData): ReferenceImage | null {
    if (node.type !== CanvasNodeType.Image || (!node.metadata?.content && !node.metadata?.storageKey)) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.png`,
        type: node.metadata.mimeType || "image/png",
        dataUrl: node.metadata.content || "",
        storageKey: node.metadata.storageKey,
    };
}

function readReferenceVideo(node: CanvasNodeData): ReferenceVideo | null {
    if (node.type !== CanvasNodeType.Video || (!node.metadata?.content && !node.metadata?.storageKey)) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.mp4`,
        type: node.metadata.mimeType || "video/mp4",
        url: node.metadata.content || "",
        storageKey: node.metadata.storageKey,
        bytes: node.metadata.bytes,
        width: node.metadata.naturalWidth,
        height: node.metadata.naturalHeight,
        durationMs: node.metadata.durationMs,
    };
}

function readReferenceAudio(node: CanvasNodeData): ReferenceAudio | null {
    if (node.type !== CanvasNodeType.Audio || (!node.metadata?.content && !node.metadata?.storageKey)) return null;
    return {
        id: node.id,
        name: `${node.title || node.id}.mp3`,
        type: node.metadata.mimeType || "audio/mpeg",
        url: node.metadata.content || "",
        storageKey: node.metadata.storageKey,
        durationMs: node.metadata.durationMs,
    };
}

export type GenerationReferenceSummary = {
    nodeId: string;
    kind: NodeGenerationInput["type"];
    label: string;
    title: string;
};

export type GenerationConfirmation = {
    prompt: string;
    modelLabel: string;
    count: number;
    mediaSpec: string;
    references: GenerationReferenceSummary[];
};

export type GenerationConfirmationOptions = {
    modelLabel: string;
    count: number;
    aspectRatio?: string;
    durationSeconds?: number;
};

export function buildGenerationConfirmation(context: NodeGenerationContext, options: GenerationConfirmationOptions): GenerationConfirmation {
    const specParts = [
        options.aspectRatio ? `比例 ${options.aspectRatio}` : null,
        options.durationSeconds ? `时长 ${options.durationSeconds} 秒` : null,
    ].filter((part): part is string => Boolean(part));
    const counts: Record<NodeGenerationInput["type"], number> = { text: 0, image: 0, video: 0, audio: 0 };
    const references = context.inputs.map((input) => {
        const index = counts[input.type]++;
        const label = generationLabel(input.type, index);
        return { nodeId: input.nodeId, kind: input.type, label, title: input.title || label };
    });
    return {
        prompt: context.prompt,
        modelLabel: options.modelLabel,
        count: Math.max(1, Math.min(15, Math.floor(Math.abs(Number(options.count)) || 1))),
        mediaSpec: specParts.join(" · "),
        references,
    };
}

export type ComposerConfirmSource = {
    modelLabel: string;
    count: string | number;
    size?: string;
    videoSeconds?: string | number;
};

export type ComposerConfirmReference = {
    nodeId: string;
    kind: NodeGenerationInput["type"];
    title: string;
    active: boolean;
};

/**
 * 从 Composer 面板的实时配置组装手动确认卡片的展示数据。
 * 只消费面板已有的字段，不触碰生成执行本身——确认拦截发生在调用之前。
 */
export function buildComposerConfirmation(
    mode: CanvasGenerationMode,
    prompt: string,
    source: ComposerConfirmSource,
    references: ComposerConfirmReference[],
): GenerationConfirmation {
    const inputs: NodeGenerationInput[] = references
        .filter((reference) => reference.active)
        .map((reference) => ({
            nodeId: reference.nodeId,
            type: reference.kind,
            title: reference.title,
        }));
    const isVideo = mode === "video";
    const isImage = mode === "image";
    const aspectRatio = isVideo || isImage ? (isVideo ? normalizeSeedanceRatio(source.size || "") : source.size) : undefined;
    const durationSeconds = isVideo ? Number(source.videoSeconds) || undefined : undefined;
    const context: NodeGenerationContext = {
        prompt,
        inputs,
        referenceImages: [],
        referenceVideos: [],
        referenceAudios: [],
        textCount: 0,
        imageCount: 0,
        videoCount: 0,
        audioCount: 0,
    };
    return buildGenerationConfirmation(context, {
        modelLabel: source.modelLabel,
        count: Number(source.count) || 1,
        aspectRatio,
        durationSeconds,
    });
}
