import type { DramaEpisode, DramaNamedAsset, DramaProject } from "@/lib/drama-project-contract";
import type { DramaAssetKind } from "./drama-asset-definitions";
import { dramaAssetReferences } from "./drama-asset-reference-utils";

export type DramaAssetFilter = "all" | "current-episode" | "missing-reference" | "incomplete" | "used" | "unused";
export type DramaAssetSort = "default" | "attention" | "usage" | "name";

export type DramaAssetLibraryRow = {
    asset: DramaNamedAsset;
    referenceCount: number;
    usageCount: number;
    currentEpisodeUsageCount: number;
    incomplete: boolean;
};

export function buildDramaAssetLibraryRows(project: DramaProject, episode: DramaEpisode, kind: DramaAssetKind): DramaAssetLibraryRow[] {
    return project[kind].map((asset) => ({
        asset,
        referenceCount: dramaAssetReferences(asset).length,
        usageCount: assetUsageCount(project, kind, asset.id),
        currentEpisodeUsageCount: assetUsageCountInEpisode(episode, kind, asset.id),
        incomplete: isDramaAssetIncomplete(asset, kind),
    }));
}

export function filterAndSortDramaAssets(rows: DramaAssetLibraryRow[], filter: DramaAssetFilter, sort: DramaAssetSort, query: string) {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const filtered = rows.filter((row) => {
        if (filter === "current-episode" && row.currentEpisodeUsageCount === 0) return false;
        if (filter === "missing-reference" && row.referenceCount > 0) return false;
        if (filter === "incomplete" && !row.incomplete) return false;
        if (filter === "used" && row.usageCount === 0) return false;
        if (filter === "unused" && row.usageCount > 0) return false;
        if (!normalizedQuery) return true;
        const profile = row.asset.profile;
        const payoff = "payoff" in row.asset && typeof row.asset.payoff === "string" ? row.asset.payoff : "";
        const searchable = [row.asset.name, row.asset.description, profile?.visualIdentity, profile?.styling, profile?.colorPalette, profile?.consistencyRules, payoff];
        return searchable.some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
    });

    if (sort === "default") return filtered;
    return filtered.sort((left, right) => {
        if (sort === "usage") return right.usageCount - left.usageCount || left.asset.name.localeCompare(right.asset.name, "zh-CN");
        if (sort === "name") return left.asset.name.localeCompare(right.asset.name, "zh-CN");
        return assetAttentionScore(right) - assetAttentionScore(left) || left.asset.name.localeCompare(right.asset.name, "zh-CN");
    });
}

function isDramaAssetIncomplete(asset: DramaNamedAsset, kind: DramaAssetKind) {
    const profile = asset.profile;
    if (!asset.description.trim() || !profile || Object.values(profile).some((value) => !value.trim())) return true;
    return kind === "clues" && "payoff" in asset ? typeof asset.payoff !== "string" || !asset.payoff.trim() : false;
}

function assetAttentionScore(row: DramaAssetLibraryRow) {
    return Number(row.referenceCount === 0) * 4 + Number(row.incomplete) * 2 + Number(row.usageCount === 0);
}

function assetUsageCount(project: DramaProject, kind: DramaAssetKind, assetId: string) {
    return project.episodes.reduce((total, episode) => total + assetUsageCountInEpisode(episode, kind, assetId), 0);
}

function assetUsageCountInEpisode(episode: DramaEpisode, kind: DramaAssetKind, assetId: string) {
    return episode.shots.filter((shot) => {
        if (kind === "characters") return shot.characterIds.includes(assetId);
        if (kind === "scenes") return shot.sceneId === assetId;
        if (kind === "props") return shot.propIds.includes(assetId);
        return shot.clueIds.includes(assetId);
    }).length;
}
