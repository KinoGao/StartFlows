import { CanvasNodeType, type CanvasNodeData, type Position, type ViewportTransform } from "../types";

const HANDLE_CLEARANCE = 32;
const FORWARD_GAP = HANDLE_CLEARANCE * 2;
const CORNER_RADIUS = 14;

export function worldFromScreen(clientX: number, clientY: number, viewport: ViewportTransform, rect: Pick<DOMRect, "left" | "top">): Position {
    return { x: (clientX - rect.left - viewport.x) / viewport.k, y: (clientY - rect.top - viewport.y) / viewport.k };
}

export function nodeAnchor(node: CanvasNodeData, handleType: "source" | "target"): Position {
    return { x: handleType === "source" ? node.position.x + node.width : node.position.x, y: node.position.y + node.height / 2 };
}

export function edgePath(from: CanvasNodeData, to: CanvasNodeData) {
    const start = nodeAnchor(from, "source");
    const end = nodeAnchor(to, "target");
    const forwardDistance = end.x - start.x;

    if (forwardDistance >= FORWARD_GAP) return forwardCurve(start, end, 1, forwardDistance);

    const fromBottom = from.position.y + from.height;
    const toBottom = to.position.y + to.height;
    if (fromBottom <= to.position.y) return gapRoute(start, end, (fromBottom + to.position.y) / 2);
    if (toBottom <= from.position.y) return gapRoute(start, end, (toBottom + from.position.y) / 2);

    const routeAbove = Math.min(from.position.y, to.position.y) - HANDLE_CLEARANCE;
    const routeBelow = Math.max(fromBottom, toBottom) + HANDLE_CLEARANCE;
    const routeY = Math.abs(start.y - routeAbove) + Math.abs(end.y - routeAbove) <= Math.abs(start.y - routeBelow) + Math.abs(end.y - routeBelow) ? routeAbove : routeBelow;
    const outerRight = Math.max(start.x, to.position.x + to.width) + HANDLE_CLEARANCE;
    const outerLeft = Math.min(end.x, from.position.x) - HANDLE_CLEARANCE;
    return roundedPolyline([start, { x: outerRight, y: start.y }, { x: outerRight, y: routeY }, { x: outerLeft, y: routeY }, { x: outerLeft, y: end.y }, end]);
}

export function previewPath(start: Position, end: Position, handleType: "source" | "target") {
    const direction = handleType === "source" ? 1 : -1;
    const forwardDistance = (end.x - start.x) * direction;
    if (forwardDistance >= FORWARD_GAP) return forwardCurve(start, end, direction, forwardDistance);

    const routeY = (start.y + end.y) / 2;
    return roundedPolyline([
        start,
        { x: start.x + direction * HANDLE_CLEARANCE, y: start.y },
        { x: start.x + direction * HANDLE_CLEARANCE, y: routeY },
        { x: end.x - direction * HANDLE_CLEARANCE, y: routeY },
        { x: end.x - direction * HANDLE_CLEARANCE, y: end.y },
        end,
    ]);
}

export function samePosition(a: Position, b: Position) {
    return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
}

export function selectNodesInBounds(nodes: CanvasNodeData[], start: Position, end: Position, initialNodeIds: Iterable<string> = []) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    const selected = new Set(initialNodeIds);
    for (const node of nodes) {
        if (node.position.x < maxX && node.position.x + node.width > minX && node.position.y < maxY && node.position.y + node.height > minY) selected.add(node.id);
    }
    return selected;
}

export function expandCanvasDragNodeIds(nodes: CanvasNodeData[], selectedNodeIds: Iterable<string>) {
    const dragNodeIds = new Set(selectedNodeIds);
    for (const node of nodes) {
        if (!dragNodeIds.has(node.id)) continue;
        node.metadata?.batchChildIds?.forEach((childId) => dragNodeIds.add(childId));
    }
    return [...dragNodeIds];
}

export function findConnectionTarget(world: Position, draft: { nodeId: string; handleType: "source" | "target" }, nodes: CanvasNodeData[], scale: number) {
    const tolerance = 52 / Math.max(scale, 0.1);
    let best: { id: string; distance: number } | null = null;
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
        const node = nodes[index];
        if (node.id === draft.nodeId || (draft.handleType === "target" && node.type === CanvasNodeType.Config)) continue;
        const anchor = nodeAnchor(node, draft.handleType === "source" ? "target" : "source");
        const inside = world.x >= node.position.x && world.x <= node.position.x + node.width && world.y >= node.position.y && world.y <= node.position.y + node.height;
        const distance = Math.hypot(world.x - anchor.x, world.y - anchor.y);
        if (!inside && distance > tolerance) continue;
        if (!best || distance < best.distance) best = { id: node.id, distance };
    }
    return best?.id || null;
}

export function isBlockedConnectionDrop(world: Position, draft: { nodeId: string; handleType: "source" | "target" }, nodes: CanvasNodeData[], scale: number) {
    const tolerance = 52 / Math.max(scale, 0.1);
    return nodes.some((node) => {
        const blocked = node.id === draft.nodeId || (draft.handleType === "target" && node.type === CanvasNodeType.Config);
        if (!blocked) return false;
        const anchor = nodeAnchor(node, draft.handleType === "source" ? "target" : "source");
        const inside = world.x >= node.position.x && world.x <= node.position.x + node.width && world.y >= node.position.y && world.y <= node.position.y + node.height;
        return inside || Math.hypot(world.x - anchor.x, world.y - anchor.y) <= tolerance;
    });
}

function forwardCurve(start: Position, end: Position, direction: 1 | -1, forwardDistance: number) {
    const curvature = Math.min(Math.max(forwardDistance * 0.5, 50), 240);
    return `M ${start.x} ${start.y} C ${start.x + direction * curvature} ${start.y}, ${end.x - direction * curvature} ${end.y}, ${end.x} ${end.y}`;
}

function gapRoute(start: Position, end: Position, routeY: number) {
    return roundedPolyline([start, { x: start.x + HANDLE_CLEARANCE, y: start.y }, { x: start.x + HANDLE_CLEARANCE, y: routeY }, { x: end.x - HANDLE_CLEARANCE, y: routeY }, { x: end.x - HANDLE_CLEARANCE, y: end.y }, end]);
}

function roundedPolyline(points: Position[]) {
    const compact = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.y !== points[index - 1].y);
    if (compact.length < 2) return "";

    let path = `M ${format(compact[0].x)} ${format(compact[0].y)}`;
    for (let index = 1; index < compact.length - 1; index += 1) {
        const previous = compact[index - 1];
        const current = compact[index];
        const next = compact[index + 1];
        const incomingLength = Math.hypot(current.x - previous.x, current.y - previous.y);
        const outgoingLength = Math.hypot(next.x - current.x, next.y - current.y);
        const radius = Math.min(CORNER_RADIUS, incomingLength / 2, outgoingLength / 2);
        const before = moveToward(current, previous, radius);
        const after = moveToward(current, next, radius);
        path += ` L ${format(before.x)} ${format(before.y)} Q ${format(current.x)} ${format(current.y)} ${format(after.x)} ${format(after.y)}`;
    }
    const end = compact[compact.length - 1];
    return `${path} L ${format(end.x)} ${format(end.y)}`;
}

function moveToward(from: Position, to: Position, distance: number) {
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    if (!length) return from;
    return { x: from.x + ((to.x - from.x) / length) * distance, y: from.y + ((to.y - from.y) / length) * distance };
}

function format(value: number) {
    return Number(value.toFixed(2));
}
