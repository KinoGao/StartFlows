import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";

/**
 * 整组执行计划：同一层级的节点互不依赖可并发执行，层级之间按拓扑序依次执行。
 */
export type GroupExecutionPlan = {
    /** 按拓扑序分层的可执行节点 id（保持组内成员顺序） */
    levels: string[][];
    /** 每个可执行节点在组内的可执行上游依赖集合（含跨中间节点的传递依赖） */
    dependencies: Map<string, Set<string>>;
};

/**
 * 收集整组执行的成员节点 id：
 * - 起点是打组节点（Group）或属于某个打组时，取该组的 groupChildIds；
 * - 否则沿连线做无向 BFS，取与起点相连通的整组节点。
 */
export function collectGroupMemberIds(nodes: CanvasNodeData[], connections: CanvasConnection[], startNodeId: string): string[] {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const startNode = nodeById.get(startNodeId);
    if (!startNode) return [];

    const group = startNode.type === CanvasNodeType.Group ? startNode : nodes.find((node) => node.type === CanvasNodeType.Group && node.metadata?.groupChildIds?.includes(startNodeId));
    if (group) {
        return (group.metadata?.groupChildIds || []).filter((id) => {
            const node = nodeById.get(id);
            return Boolean(node && node.type !== CanvasNodeType.Group);
        });
    }

    const visited = new Set<string>([startNodeId]);
    const queue = [startNodeId];
    while (queue.length) {
        const current = queue.shift()!;
        for (const connection of connections) {
            const next = connection.fromNodeId === current ? connection.toNodeId : connection.toNodeId === current ? connection.fromNodeId : null;
            if (next && !visited.has(next) && nodeById.has(next)) {
                visited.add(next);
                queue.push(next);
            }
        }
    }
    return nodes.filter((node) => visited.has(node.id)).map((node) => node.id);
}

/**
 * 判断节点是否可在整组执行中被重新触发生成：
 * - ComfyUI 节点始终可执行；
 * - 文本节点仅在带 prompt（AI 生成文本）时可执行，纯手写文本是上游输入；
 * - 图片 / 视频 / 音频节点需要自身留有生成信息（prompt / requestPrompt / generationType），
 *   或有上游连线提供提示词与参考内容；
 * - 分组框、生成配置等节点不可执行。
 */
export function isGroupExecutableNode(node: CanvasNodeData, hasIncoming: boolean): boolean {
    const metadata = node.metadata;
    if (node.type === CanvasNodeType.ComfyUI) return true;
    if (node.type === CanvasNodeType.Text) return Boolean(metadata?.prompt?.trim());
    if (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video || node.type === CanvasNodeType.Audio) {
        return Boolean(metadata?.prompt?.trim() || metadata?.requestPrompt?.trim() || metadata?.generationType || hasIncoming);
    }
    return false;
}

/**
 * 按组内连线构建整组执行计划：
 * 依赖沿连线向上游传递（可穿过文本、配置等不可执行的中间节点），
 * 对每个可执行节点收集其全部可执行祖先，再按 Kahn 分层得到拓扑执行层级。
 * 出现环时剩余节点兜底为最后一层，按原顺序执行。
 */
export function buildGroupExecutionPlan(nodes: CanvasNodeData[], connections: CanvasConnection[], memberIds: string[]): GroupExecutionPlan {
    const memberSet = new Set(memberIds);
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const incomingCount = new Map<string, number>();
    const memberIncoming = new Map<string, string[]>();
    for (const connection of connections) {
        incomingCount.set(connection.toNodeId, (incomingCount.get(connection.toNodeId) || 0) + 1);
        if (memberSet.has(connection.fromNodeId) && memberSet.has(connection.toNodeId)) {
            const list = memberIncoming.get(connection.toNodeId);
            if (list) list.push(connection.fromNodeId);
            else memberIncoming.set(connection.toNodeId, [connection.fromNodeId]);
        }
    }

    const executableIds = memberIds.filter((id) => {
        const node = nodeById.get(id);
        return Boolean(node && isGroupExecutableNode(node, Boolean(incomingCount.get(id))));
    });
    const executableSet = new Set(executableIds);

    const dependencies = new Map<string, Set<string>>();
    for (const id of executableIds) {
        const deps = new Set<string>();
        const visited = new Set<string>([id]);
        const queue = [...(memberIncoming.get(id) || [])];
        while (queue.length) {
            const current = queue.shift()!;
            if (visited.has(current)) continue;
            visited.add(current);
            if (executableSet.has(current)) deps.add(current);
            queue.push(...(memberIncoming.get(current) || []));
        }
        dependencies.set(id, deps);
    }

    const levels: string[][] = [];
    const placed = new Set<string>();
    let pending = [...executableIds];
    while (pending.length) {
        const ready = pending.filter((id) => {
            const deps = dependencies.get(id);
            return !deps || [...deps].every((dep) => placed.has(dep));
        });
        if (!ready.length) {
            levels.push([...pending]);
            break;
        }
        levels.push(ready);
        ready.forEach((id) => placed.add(id));
        pending = pending.filter((id) => !placed.has(id));
    }
    return { levels, dependencies };
}
