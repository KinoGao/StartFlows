import type { CanvasGenerationRun, CanvasGenerationRunStatus, CanvasNodeData, CanvasNodeMetadata } from "../types";

const MAX_GENERATION_RUNS = 6;

export function generationRunSettlementKey(nodes: CanvasNodeData[]): string {
    let key = "";
    for (const node of nodes) {
        const activeRun = node.metadata?.generationRuns?.find((run) => run.status === "running");
        if (!activeRun || node.metadata?.status === "loading") continue;
        key += `${node.id}:${activeRun.id}:${node.metadata?.status || "idle"}:${node.metadata?.errorDetails || ""};`;
    }
    return key;
}

/**
 * 兜底结算器：各生成完成路径只更新 metadata.status（终态）而不结算
 * generationRuns 中的 running 记录，本函数在 nodes 变化时把已结束但
 * 未结算的 run 标记为终态。纯函数，无变化时返回原引用（可安全用于
 * setNodes 的 updater，不会产生重渲染环）。
 */
export function settleFinishedGenerationRuns(nodes: CanvasNodeData[]): CanvasNodeData[] {
    let changed = false;
    const nextNodes = nodes.map((node) => {
        const activeRun = node.metadata?.generationRuns?.find((run) => run.status === "running");
        if (!activeRun || node.metadata?.status === "loading") return node;
        changed = true;
        const status: CanvasGenerationRunStatus = node.metadata?.status === "error"
            ? "failed"
            : node.metadata?.status === "idle"
              ? "cancelled"
              : "succeeded";
        return { ...node, metadata: updateCanvasGenerationRun(node.metadata, activeRun.id, status, Date.now(), node.metadata?.errorDetails) };
    });
    return changed ? nextNodes : nodes;
}

export function upsertCanvasGenerationRun(
    runs: CanvasGenerationRun[] | undefined,
    next: CanvasGenerationRun,
): CanvasGenerationRun[] {
    const existing = runs?.find((run) => run.id === next.id);
    const merged = existing ? { ...existing, ...next, startedAt: existing.startedAt } : next;
    return [merged, ...(runs || []).filter((run) => run.id !== next.id)].slice(0, MAX_GENERATION_RUNS);
}
export function updateCanvasGenerationRun(
    metadata: CanvasNodeMetadata | undefined,
    id: string,
    status: CanvasGenerationRunStatus,
    updatedAt = Date.now(),
    errorDetails?: string,
): CanvasNodeMetadata {
    const runs = metadata?.generationRuns || [];
    const current = runs.find((run) => run.id === id);
    if (!current || current.status !== "running") return metadata || {};
    return {
        ...metadata,
        generationRuns: upsertCanvasGenerationRun(runs, {
            ...current,
            status,
            updatedAt,
            ...(errorDetails ? { errorDetails } : { errorDetails: undefined }),
        }),
    };
}
