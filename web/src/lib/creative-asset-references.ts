import type { CreativeAsset } from "@/lib/creative-runtime-contract";

export type ReferenceAliasType = CreativeAsset["type"];

const REFERENCE_TYPE_LABELS: Record<ReferenceAliasType, string> = {
    image: "图片",
    video: "视频",
    audio: "音频",
    text: "文本",
};

export function creativeAssetReferenceAliases(assets: readonly CreativeAsset[], assetIds: readonly string[]) {
    return typedReferenceAliases(assets, assetIds);
}

export function typedReferenceAliases<T extends { id: string; type: ReferenceAliasType }>(assets: readonly T[], assetIds: readonly string[]) {
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const typeCounts = new Map<ReferenceAliasType, number>();
    const aliases = new Map<string, string>();
    for (const assetId of assetIds) {
        if (aliases.has(assetId)) continue;
        const asset = assetsById.get(assetId);
        if (!asset) continue;
        const ordinal = (typeCounts.get(asset.type) || 0) + 1;
        typeCounts.set(asset.type, ordinal);
        aliases.set(assetId, `${REFERENCE_TYPE_LABELS[asset.type]}${ordinal}`);
    }
    return aliases;
}

export function orderCreativeAssetsByIds(assets: readonly CreativeAsset[], assetIds: readonly string[]) {
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const ordered = assetIds.flatMap((assetId) => {
        const asset = assetsById.get(assetId);
        if (!asset) return [];
        assetsById.delete(assetId);
        return [asset];
    });
    return [...ordered, ...assets.filter((asset) => assetsById.has(asset.id))];
}
