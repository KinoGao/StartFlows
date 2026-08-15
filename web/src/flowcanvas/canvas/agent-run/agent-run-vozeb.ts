import type { CanvasAgentOp, CanvasAgentSnapshot } from "../utils/canvas-agent-ops";
import type { CanvasNodeData } from "../types";
import type { AgentRun, AgentRunPlan, AgentRunTask, AgentRunTaskStatus } from "./agent-run-types";

/** VOZEB Agent Run（/api/agent/runs）与 FlowCanvas 画布面板之间的映射。 */

type VozebRunTask = {
    id: string;
    title: string;
    type?: "text" | "image" | "video" | "audio";
    status: string;
    error?: string;
};

export type VozebAgentRun = {
    id: string;
    projectId?: string;
    prompt?: string;
    status: string;
    tasks?: VozebRunTask[];
    createdAt?: number;
    updatedAt?: number;
};

/** VOZEB run → 面板进度卡片模型。 */
export function mapVozebAgentRun(run: Partial<VozebAgentRun> & { id: string }, previous?: AgentRun): AgentRun {
    return {
        id: run.id,
        projectId: run.projectId || previous?.projectId || "",
        title: (run.prompt || previous?.title || "创作任务").slice(0, 24),
        requirement: run.prompt || previous?.requirement || "",
        status: (run.status || previous?.status || "running") as AgentRun["status"],
        plan: previous?.plan,
        tasks: (run.tasks || previous?.tasks || []).map((task): AgentRunTask => {
            const status = String(task.status || "ready").toLowerCase() as AgentRunTaskStatus;
            return { id: task.id, title: task.title, type: task.type || "image", nodeId: "", status, attempts: 0, error: task.error };
        }),
        createdAt: run.createdAt || previous?.createdAt || Date.now(),
        updatedAt: run.updatedAt || Date.now(),
    };
}

/** VOZEB 快照只认 image/text/video/audio/config/panorama 等节点类型，其余（comfyui/group）剔除。 */
const SNAPSHOT_NODE_TYPES = new Set(["image", "text", "video", "audio", "config", "panorama"]);

export function buildVozebCanvasSnapshot(snapshot: CanvasAgentSnapshot) {
    const nodes = snapshot.nodes
        .filter((node) => SNAPSHOT_NODE_TYPES.has(node.type))
        .slice(0, 120)
        .map((node) => ({
            id: node.id,
            type: node.type,
            title: node.title,
            width: node.width,
            height: node.height,
            metadata: {
                content: (node.metadata?.content || "").slice(0, 500) || undefined,
                prompt: (node.metadata?.prompt || "").slice(0, 500) || undefined,
                url: node.metadata?.storageKey ? undefined : node.metadata?.content || undefined,
                size: node.metadata?.size,
                naturalWidth: node.metadata?.naturalWidth,
                naturalHeight: node.metadata?.naturalHeight,
            },
        }));
    const nodeIds = new Set(nodes.map((node) => node.id));
    return {
        projectId: snapshot.projectId,
        title: snapshot.title,
        selectedNodeIds: snapshot.selectedNodeIds.filter((id) => nodeIds.has(id)),
        nodes,
        connections: snapshot.connections.filter((conn) => nodeIds.has(conn.fromNodeId) && nodeIds.has(conn.toNodeId)).slice(0, 200),
    };
}

/** VOZEB ops 适配：task 节点类型映射为文本节点（VOZEB 服务端会把 brief/brand-kit 内部节点剔除后再下发）。 */
export function mapVozebCanvasOps(ops: unknown[]): CanvasAgentOp[] {
    return (Array.isArray(ops) ? ops : []).map((raw) => {
        const op = raw as CanvasAgentOp;
        if (op.type === "add_node" && op.nodeType && !["image", "text", "config", "comfyui", "video", "audio", "group"].includes(op.nodeType)) {
            return { ...op, nodeType: "text" as CanvasNodeData["type"] };
        }
        return op;
    });
}

/** 轻量 SSE 监听：canvas.ops 下发、run.snapshot 进度、终态收尾。返回关闭函数。 */
export function watchVozebAgentRun(
    runId: string,
    handlers: {
        onRun?: (run: Partial<VozebAgentRun> & { id: string }) => void;
        onOps?: (ops: unknown[]) => void;
        onReply?: (text: string) => void;
        onDone?: () => void;
    },
): () => void {
    const source = new EventSource(`/api/agent/runs/${encodeURIComponent(runId)}/events`);
    let settled = false;
    const close = () => {
        if (settled) return;
        settled = true;
        source.close();
        handlers.onDone?.();
    };
    const parse = (event: Event) => {
        try {
            return JSON.parse((event as MessageEvent<string>).data) as Record<string, unknown>;
        } catch {
            return null;
        }
    };
    const on = (type: string, fn: (payload: Record<string, unknown>) => void) =>
        source.addEventListener(type, (event) => {
            if (settled) return;
            const payload = parse(event);
            if (payload) fn(payload);
        });
    on("canvas.ops", (payload) => {
        if (typeof payload.reply === "string" && payload.reply.trim()) handlers.onReply?.(payload.reply);
        if (Array.isArray(payload.ops)) handlers.onOps?.(payload.ops);
    });
    on("task.retry.requested", (payload) => {
        if (Array.isArray(payload.ops)) handlers.onOps?.(payload.ops);
    });
    on("run.snapshot", (payload) => handlers.onRun?.({ ...(payload as Partial<VozebAgentRun>), id: runId }));
    on("run.paused", () => handlers.onRun?.({ id: runId, status: "paused" }));
    on("run.resumed", () => handlers.onRun?.({ id: runId, status: "running" }));
    on("run.completed", (payload) => {
        if (typeof payload.reply === "string" && payload.reply.trim()) handlers.onReply?.(payload.reply);
        handlers.onRun?.({ id: runId, status: "completed" });
        close();
    });
    on("run.failed", (payload) => {
        handlers.onRun?.({ id: runId, status: "failed" });
        if (typeof payload.message === "string" && payload.message.trim()) handlers.onReply?.(`执行失败：${payload.message}`);
        close();
    });
    on("run.cancelled", () => {
        handlers.onRun?.({ id: runId, status: "cancelled" });
        close();
    });
    source.addEventListener("error", () => {
        // SSE 断开（网络/超时）：终态由服务端保持，前端停止监听即可（重开面板会按列表恢复）
        close();
    });
    return close;
}
