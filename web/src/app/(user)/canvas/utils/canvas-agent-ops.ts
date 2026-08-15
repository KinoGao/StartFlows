import { nanoid } from "nanoid";

import { getNodeSpec } from "../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata, type ViewportTransform } from "../types";
import { fitNodeAspectRatio, nodeSizeFromRatio } from "./canvas-node-size";

export type CanvasAgentOp =
    | { type: "add_node"; id?: string; nodeType?: CanvasNodeType; title?: string; position?: { x: number; y: number }; x?: number; y?: number; width?: number; height?: number; metadata?: CanvasNodeMetadata }
    | { type: "update_node"; id: string; patch?: Partial<CanvasNodeData>; metadata?: CanvasNodeMetadata }
    | { type: "delete_node"; id?: string; ids?: string[]; nodeType?: CanvasNodeType }
    | { type: "delete_connections"; id?: string; ids?: string[]; all?: boolean }
    | { type: "connect_nodes"; id?: string; fromNodeId: string; toNodeId: string }
    | { type: "set_viewport"; viewport: ViewportTransform }
    | { type: "select_nodes"; ids: string[] }
    | { type: "run_generation"; nodeId: string; mode?: "text" | "image" | "video" | "audio"; prompt?: string };

export type CanvasAgentSnapshot = {
    projectId: string;
    title: string;
    imageSize?: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    selectedNodeIds: string[];
    viewport: ViewportTransform;
};

export function applyCanvasAgentOps(snapshot: CanvasAgentSnapshot, ops?: CanvasAgentOp[]) {
    let nodes = snapshot.nodes;
    let connections = snapshot.connections;
    let selectedNodeIds = snapshot.selectedNodeIds;
    let viewport = snapshot.viewport;

    (Array.isArray(ops) ? ops : []).forEach((op, index) => {
        if (!op?.type) return;
        if (op.type === "add_node") {
            const nodeType = Object.values(CanvasNodeType).includes(op.nodeType as CanvasNodeType) ? op.nodeType! : CanvasNodeType.Text;
            const spec = getNodeSpec(nodeType);
            const isAgentNode = Boolean(op.metadata?.agentRunId);
            const existing = op.id ? nodes.find((node) => node.id === op.id) : undefined;
            if (existing) {
                nodes = nodes.map((node) => (node.id === op.id ? { ...node, type: nodeType, title: op.title || node.title, metadata: { ...node.metadata, ...op.metadata } } : node));
                if (!isAgentNode) selectedNodeIds = [existing.id];
                return;
            }
            const requestedPosition = op.position || { x: op.x ?? index * 36, y: op.y ?? index * 36 };
            const metadata = { ...spec.metadata, ...op.metadata };
            const naturalWidth = metadata.naturalWidth;
            const naturalHeight = metadata.naturalHeight;
            const baseSize = { width: op.width || spec.width, height: op.height || spec.height };
            const maxEdge = Math.max(baseSize.width, baseSize.height);
            const size =
                isCanvasVisualMedia(nodeType) && !op.width && !op.height && naturalWidth && naturalHeight
                    ? fitNodeAspectRatio(naturalWidth, naturalHeight, maxEdge, maxEdge)
                    : isCanvasVisualMedia(nodeType) && !op.width && !op.height && metadata.size
                      ? nodeSizeFromRatio(metadata.size, maxEdge, maxEdge) || baseSize
                      : baseSize;
            const position = isAgentNode ? findFreeNodePosition(nodes, requestedPosition, size.width, size.height) : requestedPosition;
            const node: CanvasNodeData = {
                id: op.id || `${nodeType}-${Date.now()}-${index}`,
                type: nodeType,
                title: op.title || spec.title,
                position,
                width: size.width,
                height: size.height,
                metadata,
            };
            nodes = [...nodes, node];
            if (!isAgentNode) selectedNodeIds = [node.id];
        }
        if (op.type === "update_node") {
            if (!op.id) return;
            nodes = nodes.map((node) => {
                if (node.id !== op.id) return node;
                const updated = { ...node, ...op.patch, metadata: { ...node.metadata, ...op.patch?.metadata, ...op.metadata } };
                const naturalWidth = updated.metadata?.naturalWidth;
                const naturalHeight = updated.metadata?.naturalHeight;
                if (!isCanvasVisualMedia(updated.type) || !naturalWidth || !naturalHeight || updated.metadata?.freeResize) return updated;
                const size = fitNodeAspectRatio(naturalWidth, naturalHeight, Math.max(updated.width, updated.height), Math.max(updated.width, updated.height));
                const center = { x: updated.position.x + updated.width / 2, y: updated.position.y + updated.height / 2 };
                const resized = { ...updated, width: size.width, height: size.height, position: { x: center.x - size.width / 2, y: center.y - size.height / 2 } };
                if (!resized.metadata?.agentRunId) return resized;
                return {
                    ...resized,
                    position: findFreeNodePosition(
                        nodes.filter((item) => item.id !== resized.id),
                        resized.position,
                        resized.width,
                        resized.height,
                    ),
                };
            });
        }
        if (op.type === "delete_node") {
            const ids = new Set(op.ids || (op.id ? [op.id] : op.nodeType ? nodes.filter((node) => node.type === op.nodeType).map((node) => node.id) : []));
            nodes = nodes.filter((node) => !ids.has(node.id));
            connections = connections.filter((conn) => !ids.has(conn.fromNodeId) && !ids.has(conn.toNodeId));
            selectedNodeIds = selectedNodeIds.filter((id) => !ids.has(id));
        }
        if (op.type === "delete_connections") {
            const ids = new Set(op.ids || (op.id ? [op.id] : []));
            connections = op.all ? [] : connections.filter((conn) => !ids.has(conn.id));
        }
        if (op.type === "connect_nodes") {
            if (!op.fromNodeId || !op.toNodeId) return;
            const exists = connections.some((conn) => conn.fromNodeId === op.fromNodeId && conn.toNodeId === op.toNodeId);
            const hasNodes = nodes.some((node) => node.id === op.fromNodeId) && nodes.some((node) => node.id === op.toNodeId);
            if (!exists && hasNodes) connections = [...connections, { id: op.id || nanoid(), fromNodeId: op.fromNodeId, toNodeId: op.toNodeId }];
        }
        if (op.type === "set_viewport" && op.viewport) viewport = op.viewport;
        if (op.type === "select_nodes") selectedNodeIds = (op.ids || []).filter((id) => nodes.some((node) => node.id === id));
    });

    return { ...snapshot, nodes, connections, selectedNodeIds, viewport };
}

function isCanvasVisualMedia(type: CanvasNodeType) {
    return type === CanvasNodeType.Image || type === CanvasNodeType.Video || type === CanvasNodeType.Panorama;
}

export function findFreeNodePosition(nodes: CanvasNodeData[], start: { x: number; y: number }, width: number, height: number) {
    const gap = 36;
    const blockers = nodes.filter((node) => start.y < node.position.y + node.height + gap && start.y + height + gap > node.position.y).sort((left, right) => left.position.x - right.position.x);
    let x = start.x;
    for (const node of blockers) {
        const nodeRight = node.position.x + node.width + gap;
        if (x >= nodeRight) continue;
        if (x + width + gap <= node.position.x) break;
        x = nodeRight;
    }
    return { x, y: start.y };
}
