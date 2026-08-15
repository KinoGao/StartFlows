import { imageReferenceLabel } from "@/flowcanvas/lib/image-reference-prompt";
import { seedanceReferenceLabel } from "@/flowcanvas/lib/seedance-video";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";
import { sortConnectionsByReferenceOrder } from "./canvas-node-identity";

export type CanvasResourceKind = "image" | "video" | "audio" | "text";

export type CanvasResourceReference = {
    id: string;
    nodeId: string;
    kind: CanvasResourceKind;
    label: string;
    title: string;
    previewUrl?: string;
    storageKey?: string;
    text?: string;
    active: boolean;
};

export type CanvasResourceGraph = {
    nodeById: Map<string, CanvasNodeData>;
    incomingByNodeId: Map<string, CanvasConnection[]>;
    outgoingByNodeId: Map<string, CanvasConnection[]>;
    resourceNodes: CanvasNodeData[];
};

export function createCanvasResourceGraph(nodes: CanvasNodeData[], connections: CanvasConnection[], nodeById = new Map(nodes.map((node) => [node.id, node]))): CanvasResourceGraph {
    const incomingByNodeId = new Map<string, CanvasConnection[]>();
    const outgoingByNodeId = new Map<string, CanvasConnection[]>();
    connections.forEach((connection) => {
        pushConnection(incomingByNodeId, connection.toNodeId, connection);
        pushConnection(outgoingByNodeId, connection.fromNodeId, connection);
    });
    incomingByNodeId.forEach((items, nodeId) => incomingByNodeId.set(nodeId, sortConnectionsByReferenceOrder(items)));
    outgoingByNodeId.forEach((items, nodeId) => outgoingByNodeId.set(nodeId, sortConnectionsByReferenceOrder(items)));
    return { nodeById, incomingByNodeId, outgoingByNodeId, resourceNodes: nodes.filter(isResourceNode) };
}

export function buildCanvasResourceReferences(graph: CanvasResourceGraph, contextNodeId?: string | null): CanvasResourceReference[];
export function buildCanvasResourceReferences(nodes: CanvasNodeData[], connections: CanvasConnection[], contextNodeId?: string | null): CanvasResourceReference[];
export function buildCanvasResourceReferences(source: CanvasResourceGraph | CanvasNodeData[], connectionsOrContextNodeId?: CanvasConnection[] | string | null, contextNodeId?: string | null) {
    const graph = Array.isArray(source) ? createCanvasResourceGraph(source, Array.isArray(connectionsOrContextNodeId) ? connectionsOrContextNodeId : []) : source;
    const targetNodeId = Array.isArray(source) ? contextNodeId : (connectionsOrContextNodeId as string | null | undefined);
    const contextNodes = targetNodeId ? getMentionResourceNodes(targetNodeId, graph) : [];
    const globalReferences = labelResourceNodes(graph.resourceNodes, false);
    const activeByNodeId = new Map(labelResourceNodes(contextNodes, true).map((reference) => [reference.nodeId, reference]));
    return globalReferences.map((reference) => activeByNodeId.get(reference.nodeId) || reference);
}

export function buildNodeMentionReferences(node: CanvasNodeData, graph: CanvasResourceGraph): CanvasResourceReference[];
export function buildNodeMentionReferences(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]): CanvasResourceReference[];
export function buildNodeMentionReferences(node: CanvasNodeData, source: CanvasResourceGraph | CanvasNodeData[], connections?: CanvasConnection[]) {
    return labelResourceNodes(getMentionResourceNodes(node.id, Array.isArray(source) ? createCanvasResourceGraph(source, connections || []) : source), true);
}

export function getMentionResourceNodes(nodeId: string, graph: CanvasResourceGraph): CanvasNodeData[];
export function getMentionResourceNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): CanvasNodeData[];
export function getMentionResourceNodes(nodeId: string, source: CanvasResourceGraph | CanvasNodeData[], connections?: CanvasConnection[]) {
    const graph = Array.isArray(source) ? createCanvasResourceGraph(source, connections || []) : source;
    const configInputs = getConnectedConfigResourceNodes(nodeId, graph);
    if (configInputs.length) return configInputs;
    const ownInputs = getContextResourceNodes(nodeId, graph);
    if (ownInputs.length) return ownInputs;
    return [];
}

export function getGenerationResourceNodes(nodeId: string, graph: CanvasResourceGraph): CanvasNodeData[];
export function getGenerationResourceNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]): CanvasNodeData[];
export function getGenerationResourceNodes(nodeId: string, source: CanvasResourceGraph | CanvasNodeData[], connections?: CanvasConnection[]) {
    const graph = Array.isArray(source) ? createCanvasResourceGraph(source, connections || []) : source;
    const configInputs = getConnectedConfigResourceNodes(nodeId, graph);
    if (configInputs.length) return configInputs;
    const ownInputs = getContextResourceNodes(nodeId, graph);
    if (ownInputs.length) return ownInputs;
    return [];
}

function getContextResourceNodes(nodeId: string, graph: CanvasResourceGraph) {
    return (graph.incomingByNodeId.get(nodeId) || []).map((connection) => graph.nodeById.get(connection.fromNodeId)).filter((node): node is CanvasNodeData => Boolean(node && isResourceNode(node)));
}

function getConnectedConfigResourceNodes(nodeId: string, graph: CanvasResourceGraph) {
    const configConnection = (graph.outgoingByNodeId.get(nodeId) || []).find((connection) => isGenerationConfigNode(graph.nodeById.get(connection.toNodeId)));
    if (!configConnection) return [];
    return getContextResourceNodes(configConnection.toNodeId, graph).filter((node) => node.id !== nodeId);
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
                text: node.type === CanvasNodeType.Text && node.metadata?.canvasTool !== "script" ? node.metadata?.content || node.metadata?.prompt : undefined,
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

function pushConnection(index: Map<string, CanvasConnection[]>, nodeId: string, connection: CanvasConnection) {
    const connections = index.get(nodeId);
    if (connections) connections.push(connection);
    else index.set(nodeId, [connection]);
}

function isResourceNode(node: CanvasNodeData) {
    return Boolean(resourceKind(node));
}

function resourceKind(node: CanvasNodeData): CanvasResourceKind | null {
    if (node.type === CanvasNodeType.Image && (node.metadata?.content || node.metadata?.storageKey)) return "image";
    if (node.type === CanvasNodeType.Video && (node.metadata?.content || node.metadata?.storageKey)) return "video";
    if (node.type === CanvasNodeType.Audio && (node.metadata?.content || node.metadata?.storageKey)) return "audio";
    // 脚本节点（canvasTool="script"）不参与上游文本引用：正文是剧本工作台内容，不作为下游提示词输入。
    if (node.type === CanvasNodeType.Text && node.metadata?.canvasTool !== "script" && (node.metadata?.content || node.metadata?.prompt)) return "text";
    return null;
}

function isGenerationConfigNode(node: CanvasNodeData | undefined) {
    return node?.type === CanvasNodeType.Config || node?.type === CanvasNodeType.ComfyUI;
}
