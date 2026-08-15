const CANVAS_SNAPSHOT_VERSION = 1 as const;

export type AgentRunCanvasSnapshotNode = {
    id: string;
    type: string;
    title: string;
    width?: number;
    height?: number;
    metadata: {
        size?: string;
        content?: string;
        url?: string;
        naturalWidth?: number;
        naturalHeight?: number;
    };
};

export type AgentRunCanvasSnapshotConnection = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
};

export type AgentRunCanvasSnapshot = {
    canvasSnapshotVersion: typeof CANVAS_SNAPSHOT_VERSION;
    projectId: string;
    title: string;
    imageSize: string;
    selectedNodeIds: string[];
    nodes: AgentRunCanvasSnapshotNode[];
    connections: AgentRunCanvasSnapshotConnection[];
    analysis: {
        nodeCount: number;
        selectedNodeTypes: string[];
    };
};

export function normalizeAgentRunCanvasSnapshot(snapshot: unknown, authoritativeProjectId?: string): AgentRunCanvasSnapshot {
    const source = record(snapshot);
    const selectedNodeIds = uniqueStrings(source.selectedNodeIds);
    const selected = new Set(selectedNodeIds);
    const retainedNodeIds = new Set(selectedNodeIds);
    const keepAll = selected.size === 0;
    const connections: AgentRunCanvasSnapshotConnection[] = [];

    for (const value of array(source.connections)) {
        const connection = record(value);
        const fromNodeId = text(connection.fromNodeId);
        const toNodeId = text(connection.toNodeId);
        if (!fromNodeId || !toNodeId || (!keepAll && !selected.has(fromNodeId) && !selected.has(toNodeId))) continue;
        retainedNodeIds.add(fromNodeId);
        retainedNodeIds.add(toNodeId);
        connections.push({ id: text(connection.id), fromNodeId, toNodeId });
    }

    const nodes: AgentRunCanvasSnapshotNode[] = [];
    const selectedNodeTypes = new Set<string>();
    const seenNodeIds = new Set<string>();
    let nodeCount = 0;
    for (const value of array(source.nodes)) {
        const node = record(value);
        const id = text(node.id);
        const type = text(node.type);
        if (!id || seenNodeIds.has(id)) continue;
        seenNodeIds.add(id);
        nodeCount += 1;
        if (selected.has(id) && type) selectedNodeTypes.add(type);
        if (!keepAll && !retainedNodeIds.has(id) && type !== "config") continue;
        nodes.push(normalizeNode(node, id, type));
    }

    return {
        canvasSnapshotVersion: CANVAS_SNAPSHOT_VERSION,
        projectId: text(authoritativeProjectId) || text(source.projectId),
        title: text(source.title),
        imageSize: text(source.imageSize),
        selectedNodeIds,
        nodes,
        connections,
        analysis: { nodeCount, selectedNodeTypes: Array.from(selectedNodeTypes) },
    };
}

export function agentRunCanvasSnapshot(snapshot: unknown): AgentRunCanvasSnapshot {
    return isAgentRunCanvasSnapshot(snapshot) ? snapshot : normalizeAgentRunCanvasSnapshot(snapshot);
}

export function canvasSnapshotPlannerView(snapshot: unknown) {
    const normalized = agentRunCanvasSnapshot(snapshot);
    return {
        projectId: normalized.projectId,
        title: normalized.title,
        imageSize: normalized.imageSize,
        selectedNodeIds: normalized.selectedNodeIds,
        nodes: normalized.nodes,
        connections: normalized.connections,
    };
}

export function canvasSnapshotPlanningFacts(snapshot: unknown) {
    return agentRunCanvasSnapshot(snapshot).analysis;
}

export function selectedCanvasNodeIds(snapshot: unknown) {
    return agentRunCanvasSnapshot(snapshot).selectedNodeIds;
}

function isAgentRunCanvasSnapshot(value: unknown): value is AgentRunCanvasSnapshot {
    const source = record(value);
    const analysis = record(source.analysis);
    return (
        source.canvasSnapshotVersion === CANVAS_SNAPSHOT_VERSION &&
        Array.isArray(source.selectedNodeIds) &&
        Array.isArray(source.nodes) &&
        Array.isArray(source.connections) &&
        Number.isSafeInteger(analysis.nodeCount) &&
        Array.isArray(analysis.selectedNodeTypes)
    );
}

function normalizeNode(node: Record<string, unknown>, id: string, type: string): AgentRunCanvasSnapshotNode {
    const metadata = record(node.metadata);
    return {
        id,
        type,
        title: text(node.title),
        width: positiveNumber(node.width),
        height: positiveNumber(node.height),
        metadata: {
            size: optionalText(metadata.size),
            content: safeNodeContent(metadata.content) || safeNodeContent(metadata.prompt),
            url: safeMediaUrl(metadata.serverUrl) || safeMediaUrl(metadata.remoteUrl) || safeMediaUrl(metadata.url),
            naturalWidth: positiveNumber(metadata.naturalWidth),
            naturalHeight: positiveNumber(metadata.naturalHeight),
        },
    };
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function uniqueStrings(value: unknown) {
    return Array.from(new Set(array(value).flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : []))));
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: unknown) {
    return text(value) || undefined;
}

function safeMediaUrl(value: unknown) {
    const url = optionalText(value);
    return url && (url.startsWith("/api/reference-assets/") || url.startsWith("/api/generation-log-assets/")) ? url : undefined;
}

function safeNodeContent(value: unknown) {
    const content = optionalText(value);
    return content && !content.startsWith("data:") && !content.startsWith("blob:") ? content : undefined;
}

function positiveNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}
