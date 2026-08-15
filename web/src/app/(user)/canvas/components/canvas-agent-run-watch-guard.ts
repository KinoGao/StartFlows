export async function withCanvasAgentRunWatch(watching: Set<string>, runId: string, watch: () => Promise<void>) {
    if (watching.has(runId)) return false;
    watching.add(runId);
    try {
        await watch();
        return true;
    } finally {
        watching.delete(runId);
    }
}
