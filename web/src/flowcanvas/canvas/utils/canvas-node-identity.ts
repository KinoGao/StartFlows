import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";

export type CanvasNodeSequenceCounters = Partial<Record<CanvasNodeType, number>>;

const NODE_TYPES = new Set<CanvasNodeData["type"]>(Object.values(CanvasNodeType));

const TITLE_STEM_BY_TYPE: Record<CanvasNodeData["type"], string> = {
    text: "文本",
    image: "图片",
    video: "视频",
    audio: "音频",
    comfyui: "ComfyUI",
    config: "生成",
    group: "分组",
};

const LEGACY_DEFAULT_TITLES: Partial<Record<CanvasNodeData["type"], string[]>> = {
    text: ["Note", "Text", "文本", "Generated Text", "Assistant Text", "Prompt"],
    image: ["New Generation", "Image", "图片", "Generated Image", "ComfyUI Image"],
    video: ["Video", "视频", "Generated Video", "ComfyUI Video"],
    audio: ["Audio", "音频", "Generated Audio", "ComfyUI Audio"],
    comfyui: ["ComfyUI"],
    config: ["生成配置", "配置节点", "Config"],
    group: ["分组", "分镜组"],
};

export function getDefaultCanvasNodeTitle(type: CanvasNodeData["type"], sequence: number) {
    return `${TITLE_STEM_BY_TYPE[type]}节点 ${sequence}`;
}

export function allocateCanvasNodeIdentity(type: CanvasNodeData["type"], counters: CanvasNodeSequenceCounters = {}) {
    const nodeSequenceCounters = normalizeCounters(counters);
    const typeSequence = (nodeSequenceCounters[type] || 0) + 1;
    nodeSequenceCounters[type] = typeSequence;
    return {
        title: getDefaultCanvasNodeTitle(type, typeSequence),
        typeSequence,
        nodeSequenceCounters,
    };
}

export function normalizeCanvasNodeIdentities(nodes: CanvasNodeData[], counters: CanvasNodeSequenceCounters = {}) {
    const nodeSequenceCounters = normalizeCounters(counters);
    const usedSequences = new Map<CanvasNodeData["type"], Set<number>>();

    nodes.forEach((node) => {
        if (!NODE_TYPES.has(node.type)) return;
        const sequence = node.metadata?.typeSequence;
        if (!isPositiveInteger(sequence)) return;
        nodeSequenceCounters[node.type] = Math.max(nodeSequenceCounters[node.type] || 0, sequence);
    });

    const normalizedNodes = nodes.map((node) => {
        if (!NODE_TYPES.has(node.type)) return node;

        const sequence = node.metadata?.typeSequence;
        const used = usedSequences.get(node.type) || new Set<number>();
        usedSequences.set(node.type, used);
        const typeSequence = isPositiveInteger(sequence) && !used.has(sequence)
            ? sequence
            : (nodeSequenceCounters[node.type] || 0) + 1;
        used.add(typeSequence);
        nodeSequenceCounters[node.type] = Math.max(nodeSequenceCounters[node.type] || 0, typeSequence);

        const title = needsDefaultTitle(node.type, node.title) ? getDefaultCanvasNodeTitle(node.type, typeSequence) : node.title;
        if (title === node.title && typeSequence === sequence) return node;
        return { ...node, title, metadata: { ...node.metadata, typeSequence } };
    });

    return { nodes: normalizedNodes, nodeSequenceCounters };
}

export function normalizeCanvasConnectionOrders(connections: CanvasConnection[], counter = 0) {
    let referenceOrderCounter = Math.max(0, toNonNegativeInteger(counter));
    const usedOrders = new Set<number>();

    connections.forEach((connection) => {
        if (!isPositiveInteger(connection.referenceOrder)) return;
        referenceOrderCounter = Math.max(referenceOrderCounter, connection.referenceOrder);
    });

    const normalizedConnections = connections.map((connection) => {
        const referenceOrder = connection.referenceOrder;
        const nextReferenceOrder = isPositiveInteger(referenceOrder) && !usedOrders.has(referenceOrder)
            ? referenceOrder
            : referenceOrderCounter + 1;
        usedOrders.add(nextReferenceOrder);
        referenceOrderCounter = Math.max(referenceOrderCounter, nextReferenceOrder);
        return nextReferenceOrder === referenceOrder ? connection : { ...connection, referenceOrder: nextReferenceOrder };
    });

    return { connections: normalizedConnections, referenceOrderCounter };
}

export function sortConnectionsByReferenceOrder(connections: CanvasConnection[]) {
    return connections
        .map((connection, index) => ({ connection, index }))
        .sort((left, right) => {
            const leftOrder = isPositiveInteger(left.connection.referenceOrder) ? left.connection.referenceOrder : Number.MAX_SAFE_INTEGER;
            const rightOrder = isPositiveInteger(right.connection.referenceOrder) ? right.connection.referenceOrder : Number.MAX_SAFE_INTEGER;
            return leftOrder - rightOrder || left.index - right.index;
        })
        .map(({ connection }) => connection);
}

function normalizeCounters(counters: CanvasNodeSequenceCounters) {
    return Object.fromEntries(
        Object.entries(counters)
            .filter(([type, value]) => NODE_TYPES.has(type as CanvasNodeData["type"]) && isPositiveInteger(value))
            .map(([type, value]) => [type, value]),
    ) as CanvasNodeSequenceCounters;
}

function needsDefaultTitle(type: CanvasNodeData["type"], title: string) {
    return !title.trim() || (LEGACY_DEFAULT_TITLES[type] || []).includes(title.trim());
}

function isPositiveInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function toNonNegativeInteger(value: unknown) {
    return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}
