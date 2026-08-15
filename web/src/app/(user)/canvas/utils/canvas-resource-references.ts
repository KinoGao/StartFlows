import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { seedanceReferenceLabel } from "@/lib/seedance-video";
import { CanvasNodeType, isCanvasImageNodeType, type CanvasConnection, type CanvasNodeData } from "../types";

type CanvasResourceKind = "image" | "video" | "audio" | "text";

export type CanvasResourceReference = {
    id: string;
    nodeId: string;
    kind: CanvasResourceKind;
    label: string;
    title: string;
    previewUrl?: string;
    storageKey?: string;
    remoteUrl?: string;
    serverUrl?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    bytes?: number;
    durationMs?: number;
    text?: string;
    active: boolean;
};

export function buildCanvasResourceReferences(nodes: CanvasNodeData[], connections: CanvasConnection[], contextNodeId?: string | null) {
    const contextNodes = contextNodeId ? getMentionResourceNodes(contextNodeId, nodes, connections) : [];
    const globalReferences = labelResourceNodes(nodes.filter(isResourceNode), false);
    const activeByNodeId = new Map(labelResourceNodes(contextNodes, true).map((reference) => [reference.nodeId, reference]));
    return globalReferences.map((reference) => activeByNodeId.get(reference.nodeId) || reference);
}

export function buildNodeMentionReferences(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    return labelResourceNodes(getMentionResourceNodes(node.id, nodes, connections), true);
}

function getMentionResourceNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const configInputs = getConnectedConfigResourceNodes(nodeId, nodes, connections);
    if (configInputs.length) return configInputs;
    const ownInputs = getContextResourceNodes(nodeId, nodes, connections);
    if (ownInputs.length) return ownInputs;
    const node = nodes.find((item) => item.id === nodeId);
    return node && isResourceNode(node) ? [node] : [];
}

export function getGenerationResourceNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const configInputs = getConnectedConfigResourceNodes(nodeId, nodes, connections);
    if (configInputs.length) return configInputs;
    const ownInputs = getContextResourceNodes(nodeId, nodes, connections);
    if (ownInputs.length) return ownInputs;
    return [];
}

function getContextResourceNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    return connections
        .filter((connection) => connection.toNodeId === nodeId)
        .map((connection) => nodes.find((node) => node.id === connection.fromNodeId))
        .filter((node): node is CanvasNodeData => Boolean(node && isResourceNode(node)));
}

function getConnectedConfigResourceNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const configConnection = connections.find((connection) => connection.fromNodeId === nodeId && nodes.find((node) => node.id === connection.toNodeId)?.type === CanvasNodeType.Config);
    if (!configConnection) return [];
    return getContextResourceNodes(configConnection.toNodeId, nodes, connections).filter((node) => node.id !== nodeId);
}

function labelResourceNodes(nodes: CanvasNodeData[], active: boolean) {
    const counts: Record<CanvasResourceKind, number> = { image: 0, video: 0, audio: 0, text: 0 };
    return nodes.flatMap((node): CanvasResourceReference[] => {
        const kind = resourceKind(node);
        if (!kind) return [];
        const index = counts[kind]++;
        const label = labelForKind(kind, index);
        return [
            {
                id: node.id,
                nodeId: node.id,
                kind,
                label,
                title: node.title || label,
                previewUrl: node.metadata?.content,
                storageKey: node.metadata?.storageKey,
                remoteUrl: node.metadata?.remoteUrl,
                serverUrl: node.metadata?.serverUrl,
                mimeType: node.metadata?.mimeType,
                width: node.metadata?.naturalWidth || node.width,
                height: node.metadata?.naturalHeight || node.height,
                bytes: node.metadata?.bytes,
                durationMs: node.metadata?.durationMs,
                text: node.type === CanvasNodeType.Text ? node.metadata?.content || node.metadata?.prompt : undefined,
                active,
            },
        ];
    });
}

function labelForKind(kind: CanvasResourceKind, index: number) {
    if (kind === "image") return imageReferenceLabel(index);
    if (kind === "video") return seedanceReferenceLabel("video", index);
    if (kind === "audio") return seedanceReferenceLabel("audio", index);
    return `文本${index + 1}`;
}

function isResourceNode(node: CanvasNodeData) {
    return Boolean(resourceKind(node));
}

function resourceKind(node: CanvasNodeData): CanvasResourceKind | null {
    if (isCanvasImageNodeType(node.type) && node.metadata?.content) return "image";
    if (node.type === CanvasNodeType.Video && node.metadata?.content) return "video";
    if (node.type === CanvasNodeType.Audio && node.metadata?.content) return "audio";
    if (node.type === CanvasNodeType.Text && (node.metadata?.content || node.metadata?.prompt)) return "text";
    return null;
}
