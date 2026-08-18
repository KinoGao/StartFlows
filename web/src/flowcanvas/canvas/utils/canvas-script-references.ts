import type { VideoGenerationMode } from "@/flowcanvas/services/api/model-capabilities";
import type { CanvasScriptAsset, CanvasScriptBeat } from "../types";

/**
 * 解析分镜生成时携带的参考图节点 id。
 * 用户显式选择（含显式清空）优先；未设置时自动带入角色/场景资产的设定图输出节点。
 * isUsable 由调用方判定节点是否仍是可用图片（存在且有 content/storageKey）。
 */
export function resolveScriptBeatReferenceIds(beat: Pick<CanvasScriptBeat, "character" | "scene" | "referenceNodeIds">, assets: CanvasScriptAsset[], assetOutputs: Record<string, string>, isUsable: (nodeId: string) => boolean): string[] {
    if (beat.referenceNodeIds) return beat.referenceNodeIds.filter(isUsable);
    const derived: string[] = [];
    for (const name of [beat.character, beat.scene]) {
        const trimmed = name?.trim();
        if (!trimmed) continue;
        const asset = assets.find((item) => item.name.trim() === trimmed);
        const outputId = asset ? assetOutputs[asset.id] : undefined;
        if (outputId && isUsable(outputId) && !derived.includes(outputId)) derived.push(outputId);
    }
    return derived;
}

/** 按参考图数量推导视频生成模式：0 文生 / 1 首帧图生 / 2+ 图片参考 */
export function deriveScriptBeatVideoMode(referenceCount: number): VideoGenerationMode {
    if (referenceCount <= 0) return "text-to-video";
    if (referenceCount === 1) return "image-to-video";
    return "image-reference";
}

/** 视频生成的参考图序列：分镜帧（两段式）固定放在首位充当首帧，其余垫图随后。 */
export function composeScriptBeatVideoReferenceIds(
    frameNodeId: string | undefined,
    beat: Pick<CanvasScriptBeat, "character" | "scene" | "referenceNodeIds">,
    assets: CanvasScriptAsset[],
    assetOutputs: Record<string, string>,
    isUsable: (nodeId: string) => boolean,
): string[] {
    const base = resolveScriptBeatReferenceIds(beat, assets, assetOutputs, isUsable);
    if (frameNodeId && isUsable(frameNodeId) && !base.includes(frameNodeId)) return [frameNodeId, ...base];
    return base;
}
