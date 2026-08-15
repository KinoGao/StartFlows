"use client";

import { nanoid } from "nanoid";

import type { CanvasNodeData } from "@/app/(user)/canvas/types";
import { CanvasNodeType } from "@/app/(user)/canvas/types";
import { nodeSizeFromRatio } from "@/app/(user)/canvas/utils/canvas-node-size";
import type { DramaSourceAsset } from "@/app/(user)/drama/types";
import type { CreativeAsset, CreativeProjectHandoff } from "@/lib/creative-runtime-contract";

export type MaterializedCreativeProject = {
    handoffId: string;
    surface: CreativeProjectHandoff["surface"];
    projectId: string;
    href: string;
    title: string;
};

const handoffInflight = new Map<string, Promise<MaterializedCreativeProject>>();

export function materializeCreativeProjectHandoff(handoff: CreativeProjectHandoff): Promise<MaterializedCreativeProject> {
    const active = handoffInflight.get(handoff.id);
    if (active) return active;
    const promise = materializeProject(handoff).finally(() => handoffInflight.delete(handoff.id));
    handoffInflight.set(handoff.id, promise);
    return promise;
}

export async function getMaterializedCreativeProject(handoff: CreativeProjectHandoff): Promise<MaterializedCreativeProject | undefined> {
    if (handoff.surface === "canvas") {
        const useCanvasStore = await hydratedCanvasStore();
        const project = useCanvasStore.getState().summaries.find((item) => item.sourceHandoffId === handoff.id);
        return project ? materializedProject(handoff, project.id) : undefined;
    }
    const useDramaStore = await hydratedDramaStore();
    const project = useDramaStore.getState().projects.find((item) => item.sourceHandoffId === handoff.id);
    return project ? materializedProject(handoff, project.id) : undefined;
}

async function materializeProject(handoff: CreativeProjectHandoff): Promise<MaterializedCreativeProject> {
    if (handoff.surface === "canvas") {
        const useCanvasStore = await hydratedCanvasStore();
        const existing = useCanvasStore.getState().summaries.find((project) => project.sourceHandoffId === handoff.id);
        if (existing) return materializedProject(handoff, existing.id);
        const projectId = await useCanvasStore.getState().importProject({ title: handoff.title, nodes: buildCanvasHandoffNodes(handoff), connections: [] }, handoff.id);
        return materializedProject(handoff, projectId);
    }
    const useDramaStore = await hydratedDramaStore();
    const existing = useDramaStore.getState().projects.find((project) => project.sourceHandoffId === handoff.id);
    if (existing) return materializedProject(handoff, existing.id);
    const input = { ...buildDramaHandoffInput(handoff), sourceHandoffId: handoff.id };
    const projectId = await useDramaStore.getState().createProject(input);
    return materializedProject(handoff, projectId);
}

export function buildCanvasHandoffNodes(handoff: CreativeProjectHandoff): CanvasNodeData[] {
    const brief: CanvasNodeData = {
        id: `handoff-brief-${nanoid()}`,
        type: CanvasNodeType.Brief,
        title: handoff.title,
        position: { x: 40, y: 40 },
        width: 420,
        height: 260,
        metadata: {
            agentRunId: handoff.sourceRunId,
            agentBrief: {
                objective: handoff.summary,
                usage: "由创作 Agent 对话交接",
                referenceStrategy: handoff.assetIds.length ? `已导入 ${handoff.assetIds.length} 份稳定资产` : "当前未携带媒体资产",
            },
        },
    };
    return [brief, ...handoff.assets.flatMap((asset, index) => canvasAssetNode(asset, index))];
}

export function buildDramaHandoffInput(handoff: CreativeProjectHandoff) {
    const sourceAssets: DramaSourceAsset[] = handoff.assets.map((asset) => ({
        id: asset.id,
        type: asset.type,
        title: asset.title,
        textContent: asset.textContent,
        storageKey: asset.storageKey,
        remoteUrl: asset.remoteUrl,
        serverUrl: asset.serverUrl,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
    }));
    const textAssets = sourceAssets.filter((asset) => asset.type === "text" && asset.textContent?.trim());
    const initialScript = textAssets.length ? textAssets.map((asset) => `【${asset.title}】\n${asset.textContent}`).join("\n\n") : handoff.summary;
    return {
        title: handoff.title,
        summary: handoff.summary,
        style: handoff.style || "写实电影感",
        ratio: handoff.ratio || ("9:16" as const),
        initialScript,
        sourceAssets,
    };
}

function canvasAssetNode(asset: CreativeAsset, index: number): CanvasNodeData[] {
    const url = asset.serverUrl || asset.remoteUrl || "";
    if (asset.type !== "text" && !url) return [];
    const column = index % 3;
    const row = Math.floor(index / 3);
    const type = asset.type === "image" ? CanvasNodeType.Image : asset.type === "video" ? CanvasNodeType.Video : asset.type === "audio" ? CanvasNodeType.Audio : CanvasNodeType.Text;
    const dimensions = mediaDimensions(asset);
    return [
        {
            id: `handoff-asset-${asset.id}-${nanoid(5)}`,
            type,
            title: asset.title || "交接资产",
            position: { x: 520 + column * 420, y: 40 + row * 340 },
            width: dimensions.width,
            height: dimensions.height,
            metadata: {
                agentRunId: asset.sourceRunId,
                content: asset.type === "text" ? asset.textContent || "" : url,
                storageKey: asset.storageKey,
                remoteUrl: asset.remoteUrl,
                serverUrl: asset.serverUrl,
                mimeType: asset.mimeType,
                bytes: asset.bytes,
                durationMs: asset.durationMs,
                naturalWidth: asset.width,
                naturalHeight: asset.height,
                status: "success",
            },
        },
    ];
}

function mediaDimensions(asset: CreativeAsset) {
    if (asset.type === "video") return { width: 400, height: 260 };
    if (asset.type === "audio") return { width: 360, height: 180 };
    if (asset.type === "text") return { width: 360, height: 260 };
    if (asset.width && asset.height) return nodeSizeFromRatio(`${asset.width}:${asset.height}`, 360, 360) || { width: 360, height: 360 };
    return { width: 360, height: 360 };
}

function materializedProject(handoff: CreativeProjectHandoff, projectId: string): MaterializedCreativeProject {
    return { handoffId: handoff.id, surface: handoff.surface, projectId, href: `/${handoff.surface}/${projectId}`, title: handoff.title };
}

async function hydratedCanvasStore() {
    const { useCanvasStore } = await import("@/app/(user)/canvas/stores/use-canvas-store");
    await useCanvasStore.getState().hydrate();
    return useCanvasStore;
}

async function hydratedDramaStore() {
    const { useDramaStore } = await import("@/app/(user)/drama/stores/use-drama-store");
    await useDramaStore.getState().hydrate();
    return useDramaStore;
}
