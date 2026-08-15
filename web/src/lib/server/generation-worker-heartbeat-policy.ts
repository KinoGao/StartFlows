export const GENERATION_WORKER_HEARTBEAT_MAX_STALE_MS = 10 * 60_000;

export function normalizeGenerationWorkerStaleMs(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(30_000, Math.min(GENERATION_WORKER_HEARTBEAT_MAX_STALE_MS, Math.floor(number))) : 90_000;
}
