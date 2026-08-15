export function createConversationHref(conversationId: string) {
    return `/create?${new URLSearchParams({ conversationId }).toString()}`;
}

export function createConversationIdFromSearch(search: string) {
    return new URLSearchParams(search).get("conversationId")?.trim().slice(0, 160) || "";
}

export function latestResumableAgentRun<T extends { conversationId: string; status: string; updatedAt?: number }>(runs: T[]) {
    return runs.filter((run) => run.conversationId.trim() && ["planning", "running", "paused"].includes(run.status)).sort((left, right) => Number(right.updatedAt || 0) - Number(left.updatedAt || 0))[0];
}
