import type { CanvasConnection, CanvasNodeData } from "../types";

export type ConnectionSide = "source" | "target";

export const CONNECTION_HANDLE_OFFSET = 34;

export function getNodeConnectionPoint(node: CanvasNodeData, side: ConnectionSide) {
    return {
        x: node.position.x + (side === "source" ? node.width + CONNECTION_HANDLE_OFFSET : -CONNECTION_HANDLE_OFFSET),
        y: node.position.y + node.height / 2,
    };
}

export function getConnectionPoints(connection: CanvasConnection, nodeMap: Map<string, CanvasNodeData>) {
    const fromNode = nodeMap.get(connection.fromNodeId);
    const toNode = nodeMap.get(connection.toNodeId);
    if (!fromNode || !toNode) return null;
    return {
        from: getNodeConnectionPoint(fromNode, "source"),
        to: getNodeConnectionPoint(toNode, "target"),
    };
}

export function buildConnectionPathFromPoints(from: { x: number; y: number }, to: { x: number; y: number }) {
    const dx = Math.max(80, Math.abs(to.x - from.x) * 0.5);
    return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

export function buildConnectionPolyline(from: { x: number; y: number }, to: { x: number; y: number }, segments = 20) {
    const dx = Math.max(80, Math.abs(to.x - from.x) * 0.5);
    const cp1x = from.x + dx;
    const cp1y = from.y;
    const cp2x = to.x - dx;
    const cp2y = to.y;
    const points: number[] = [];
    for (let i = 0; i <= segments; i += 1) {
        const t = i / segments;
        const mt = 1 - t;
        points.push(
            mt * mt * mt * from.x + 3 * mt * mt * t * cp1x + 3 * mt * t * t * cp2x + t * t * t * to.x,
            mt * mt * mt * from.y + 3 * mt * mt * t * cp1y + 3 * mt * t * t * cp2y + t * t * t * to.y,
        );
    }
    return points;
}
