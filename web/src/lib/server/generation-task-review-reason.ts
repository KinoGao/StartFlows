export function resolveGenerationReviewReason(input: { executionPhase?: string; lastUpstreamStatus?: string; resultPayload?: unknown }) {
    if (input.executionPhase !== "needs_review") return undefined;
    const payload = input.resultPayload && typeof input.resultPayload === "object" && !Array.isArray(input.resultPayload) ? (input.resultPayload as Record<string, unknown>) : {};
    const persisted = text(payload.reviewReason) || text(payload.reason);
    if (persisted) return persisted.slice(0, 500);

    switch (text(input.lastUpstreamStatus)) {
        case "query_contract_missing":
            return "生成渠道未提供可用的异步查询路径，系统无法安全确认上游结果，已停止自动重试。";
        case "query_contract_invalid":
            return "生成渠道的查询契约返回了无效内容，系统无法安全确认上游结果，已停止自动重试。";
        case "worker_handler_missing":
            return "生成任务缺少可用的后台执行器处理器，系统已暂停自动重试。";
        case "submission_outcome_unknown":
            return "上游提交结果不确定，未取得可查询的任务 ID；为避免重复生成和扣费，系统已停止自动重试。";
        default:
            return "上游创建结果待确认；为避免重复生成和扣费，系统已停止自动重试。";
    }
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
