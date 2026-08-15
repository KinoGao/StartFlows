import { nanoid } from "nanoid";

import { getNodeSpec } from "../constants";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata, type ViewportTransform } from "../types";

export type CanvasAgentOp =
    | { type: "add_node"; id?: string; nodeType?: CanvasNodeType; title?: string; position?: { x: number; y: number }; x?: number; y?: number; width?: number; height?: number; metadata?: CanvasNodeMetadata }
    | { type: "update_node"; id: string; patch?: Partial<CanvasNodeData>; metadata?: CanvasNodeMetadata }
    | { type: "delete_node"; id?: string; ids?: string[]; nodeType?: CanvasNodeType }
    | { type: "delete_connections"; id?: string; ids?: string[]; all?: boolean }
    | { type: "connect_nodes"; id?: string; fromNodeId: string; toNodeId: string }
    | { type: "set_viewport"; viewport: ViewportTransform }
    | { type: "select_nodes"; ids: string[] }
    | { type: "run_generation"; nodeId: string; mode?: "text" | "image" | "video" | "audio"; prompt?: string }
    | { type: "retry_node"; id: string }
    | { type: "execute_group"; id: string }
    | { type: "group_nodes"; ids: string[]; variant?: "normal" | "storyboard" }
    | { type: "ungroup_nodes"; ids: string[] }
    | { type: "image_edit"; id: string; action: "angle" | "outpaint" | "lighting" | "cutout" | "panorama720"; params?: Record<string, unknown> }
    | { type: "image_quick_command"; id: string; commandId: string }
    | { type: "image_process"; id: string; action: "crop" | "split" | "upscale"; params?: Record<string, unknown> }
    | { type: "grid_storyboard"; id: string; commandId: "four-grid" | "nine-grid" | "twentyfive-grid" }
    | { type: "video_analyze"; id: string }
    | { type: "video_trim"; id: string; start: number; end: number }
    | { type: "video_compose"; id: string; clips?: { nodeId: string; start?: number; end?: number }[] }
    | { type: "save_template"; ids: string[]; name: string }
    | { type: "insert_template"; templateId?: string; name?: string }
    | { type: "comfyui_list_workflows" }
    | { type: "comfyui_get_workflow"; workflowId: string }
    | { type: "comfyui_set_workflow"; nodeId: string; workflowId: string; values?: Record<string, unknown> };

/** 有副作用（调用页面 handler、产生新任务）的 op：不进纯函数 apply，由页面层摘出分发。 */
export const CANVAS_AGENT_SIDE_EFFECT_OP_TYPES = new Set<CanvasAgentOp["type"]>([
    "run_generation",
    "retry_node",
    "execute_group",
    "group_nodes",
    "ungroup_nodes",
    "image_edit",
    "image_quick_command",
    "image_process",
    "grid_storyboard",
    "video_analyze",
    "video_trim",
    "video_compose",
    "save_template",
    "insert_template",
    "comfyui_list_workflows",
    "comfyui_get_workflow",
    "comfyui_set_workflow",
]);

export type CanvasAgentSnapshot = {
    projectId: string;
    title: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    selectedNodeIds: string[];
    viewport: ViewportTransform;
};

export type CanvasAgentApplyOptions = {
    createNode?: (op: Extract<CanvasAgentOp, { type: "add_node" }>, index: number) => CanvasNodeData;
    createConnection?: (op: Extract<CanvasAgentOp, { type: "connect_nodes" }>, index: number) => CanvasConnection;
};

export function summarizeCanvasAgentOps(ops?: CanvasAgentOp[]) {
    const counts = (Array.isArray(ops) ? ops : []).reduce<Record<string, number>>((acc, op) => {
        if (!op?.type) return acc;
        acc[op.type] = (acc[op.type] || 0) + 1;
        return acc;
    }, {});
    return Object.entries(counts)
        .map(([type, count]) => `${opLabel(type)} ${count}`)
        .join("，");
}

export function applyCanvasAgentOps(snapshot: CanvasAgentSnapshot, ops?: CanvasAgentOp[], options: CanvasAgentApplyOptions = {}) {
    let nodes = snapshot.nodes;
    let connections = snapshot.connections;
    let selectedNodeIds = snapshot.selectedNodeIds;
    let viewport = snapshot.viewport;

    (Array.isArray(ops) ? ops : []).forEach((op, index) => {
        if (!op?.type) return;
        if (op.type === "add_node") {
            const node = options.createNode?.(op, index) || createAgentNode(op, index, nodes);
            nodes = [...nodes, node];
            selectedNodeIds = [node.id];
        }
        if (op.type === "update_node") {
            if (!op.id) return;
            nodes = nodes.map((node) => (node.id === op.id ? { ...node, ...op.patch, metadata: { ...node.metadata, ...op.patch?.metadata, ...op.metadata } } : node));
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
            if (!exists && hasNodes) connections = [...connections, options.createConnection?.(op, index) || { id: op.id || nanoid(), fromNodeId: op.fromNodeId, toNodeId: op.toNodeId }];
        }
        if (op.type === "set_viewport" && op.viewport) viewport = op.viewport;
        if (op.type === "select_nodes") selectedNodeIds = (op.ids || []).filter((id) => nodes.some((node) => node.id === id));
    });

    return { ...snapshot, nodes, connections, selectedNodeIds, viewport };
}

function createAgentNode(op: Extract<CanvasAgentOp, { type: "add_node" }>, index: number, currentNodes: CanvasNodeData[]): CanvasNodeData {
    const nodeType = Object.values(CanvasNodeType).includes(op.nodeType as CanvasNodeType) ? op.nodeType! : CanvasNodeType.Text;
    const spec = getNodeSpec(nodeType);
    return {
        id: op.id || `${nodeType}-${Date.now()}-${index}`,
        type: nodeType,
        title: op.title || spec.title,
        position: op.position || { x: op.x ?? nextAgentNodeX(currentNodes), y: op.y ?? nextAgentNodeY(currentNodes) },
        width: op.width || spec.width,
        height: op.height || spec.height,
        metadata: { ...spec.metadata, ...op.metadata },
    };
}

/** 未显式指定位置的新节点：横向流式排到已有节点右侧，避免与 Agent 快照导致的重叠/斜向堆叠。 */
function nextAgentNodeX(nodes: CanvasNodeData[]): number {
    if (!nodes.length) return 0;
    const maxRight = Math.max(...nodes.map((node) => node.position.x + (node.width || 240)));
    return Math.round(maxRight + 40);
}

function nextAgentNodeY(nodes: CanvasNodeData[]): number {
    if (!nodes.length) return 0;
    const maxRight = Math.max(...nodes.map((node) => node.position.x + (node.width || 240)));
    const rightMost = nodes.filter((node) => node.position.x + (node.width || 240) === maxRight);
    return rightMost.length ? rightMost[0].position.y : 0;
}

function opLabel(type: string) {
    if (type === "add_node") return "新增节点";
    if (type === "update_node") return "更新节点";
    if (type === "delete_node") return "删除节点";
    if (type === "delete_connections") return "删除连线";
    if (type === "connect_nodes") return "连接";
    if (type === "set_viewport") return "调整视图";
    if (type === "select_nodes") return "选择节点";
    if (type === "run_generation") return "触发生成";
    if (type === "retry_node") return "重跑节点";
    if (type === "execute_group") return "整组执行";
    if (type === "group_nodes") return "打组";
    if (type === "ungroup_nodes") return "解组";
    if (type === "image_edit") return "图像编辑";
    if (type === "image_quick_command") return "快捷功能";
    if (type === "image_process") return "图像处理";
    if (type === "grid_storyboard") return "宫格分镜";
    if (type === "video_analyze") return "视频解析";
    if (type === "video_trim") return "视频剪辑";
    if (type === "video_compose") return "视频合成";
    if (type === "save_template") return "保存模板";
    if (type === "insert_template") return "插入模板";
    return type;
}
