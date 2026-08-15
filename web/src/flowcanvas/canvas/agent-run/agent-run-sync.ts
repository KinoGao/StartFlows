import { agentRunAction, fetchAgentRun, retryAgentRunTask, type BackendAgentRun } from "@/flowcanvas/services/api/agent-runs";
import type { CanvasAgentOp } from "../utils/canvas-agent-ops";
import type { AgentRun, AgentRunTask, AgentRunTaskStatus } from "./agent-run-types";

const POLL_INTERVAL_MS = 2000;
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

/** 后端 run → 前端展示模型（状态小写归一）。 */
export function mapBackendAgentRun(run: BackendAgentRun): AgentRun {
    return {
        id: run.id,
        projectId: run.projectId,
        title: run.title,
        requirement: run.requirement,
        status: run.status as AgentRun["status"],
        plan: (run.plan as AgentRun["plan"]) ?? undefined,
        tasks: (run.tasks || []).map((task): AgentRunTask => {
            const status = String(task.status || "").toLowerCase() as AgentRunTaskStatus;
            return { id: task.id, title: task.title, type: task.type, nodeId: task.nodeId, status, attempts: task.attempts || 0, error: task.error };
        }),
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
    };
}

/**
 * Agent Run 前端同步器：run 的执行在后端，前端按间隔轮询，
 * 任务状态跃迁时把结果回填到画布节点（completed → 写入产物，failed → 标错误）。
 */
export class AgentRunSync {
    private deps: {
        token: () => string;
        applyOps: (ops: CanvasAgentOp[]) => Promise<unknown> | unknown;
        onRunChange: (run: AgentRun) => void;
    };
    private pollers = new Map<string, ReturnType<typeof setInterval>>();
    private seenTaskStatus = new Map<string, Map<string, string>>();

    constructor(deps: AgentRunSync["deps"]) {
        this.deps = deps;
    }

    startPolling(runId: string) {
        if (this.pollers.has(runId)) return;
        void this.tick(runId);
        this.pollers.set(
            runId,
            setInterval(() => void this.tick(runId), POLL_INTERVAL_MS),
        );
    }

    stopPolling(runId: string) {
        const poller = this.pollers.get(runId);
        if (poller) clearInterval(poller);
        this.pollers.delete(runId);
    }

    stopAll() {
        this.pollers.forEach((poller) => clearInterval(poller));
        this.pollers.clear();
    }

    async action(runId: string, action: "pause" | "resume" | "cancel") {
        const run = await agentRunAction(this.deps.token(), runId, action);
        this.ingest(run);
        if (action === "resume") this.startPolling(runId);
    }

    async retryTask(runId: string, taskId: string) {
        const run = await retryAgentRunTask(this.deps.token(), runId, taskId);
        this.ingest(run);
        this.startPolling(runId);
    }

    private async tick(runId: string) {
        const token = this.deps.token();
        if (!token) return;
        try {
            this.ingest(await fetchAgentRun(token, runId));
        } catch {
            // 单次轮询失败静默，下个周期重试
        }
    }

    private ingest(backendRun: BackendAgentRun) {
        const run = mapBackendAgentRun(backendRun);
        this.applyNodeUpdates(backendRun);
        this.deps.onRunChange(run);
        if (TERMINAL_STATUSES.has(run.status)) this.stopPolling(run.id);
    }

    /** 把新跃迁为 completed/failed 的任务结果写回画布节点。 */
    private applyNodeUpdates(run: BackendAgentRun) {
        const seen = this.seenTaskStatus.get(run.id) ?? new Map<string, string>();
        const ops: CanvasAgentOp[] = [];
        for (const task of run.tasks || []) {
            const status = String(task.status || "").toLowerCase();
            const previous = seen.get(task.id);
            seen.set(task.id, status);
            if (previous === status) continue;
            if (status === "completed") {
                const result = task.result || {};
                ops.push({
                    type: "update_node",
                    id: task.nodeId,
                    metadata: {
                        status: "success",
                        ...(result.content ? { content: result.content } : {}),
                        ...(result.storageKey ? { storageKey: result.storageKey } : {}),
                        ...(result.mimeType ? { mimeType: result.mimeType } : {}),
                        ...(result.bytes ? { bytes: result.bytes } : {}),
                    },
                });
            } else if (status === "failed") {
                ops.push({ type: "update_node", id: task.nodeId, metadata: { status: "error", errorDetails: task.error || "生成失败" } });
            }
        }
        this.seenTaskStatus.set(run.id, seen);
        if (ops.length) void this.deps.applyOps(ops);
    }
}
