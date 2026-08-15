import { getDatabaseProvider } from "@/lib/server/database";
import { latestGenerationWorkerHeartbeat, upsertGenerationWorkerHeartbeat } from "@/lib/server/database/generation-worker-heartbeat-repository";
import { GENERATION_WORKER_HEARTBEAT_MAX_STALE_MS, normalizeGenerationWorkerStaleMs } from "@/lib/server/generation-worker-heartbeat-policy";
import { isWorkerTokenConfigured } from "@/lib/server/maintenance-auth";

const runtime = globalThis as typeof globalThis & { __vozebProGenerationWorkerHeartbeats?: Map<string, number> };
const fileHeartbeats = (runtime.__vozebProGenerationWorkerHeartbeats ??= new Map<string, number>());

export async function recordGenerationWorkerHeartbeat(workerId: string, at = Date.now()) {
    const normalized = workerId.trim().slice(0, 160);
    if (!normalized) return false;
    if (getDatabaseProvider() === "postgres") await upsertGenerationWorkerHeartbeat(normalized, new Date(at));
    else {
        fileHeartbeats.set(normalized, at);
        for (const [id, lastSeenAt] of fileHeartbeats) if (lastSeenAt < at - GENERATION_WORKER_HEARTBEAT_MAX_STALE_MS) fileHeartbeats.delete(id);
    }
    return true;
}

export async function getGenerationWorkerHealth(now = Date.now()) {
    const staleAfterMs = normalizeGenerationWorkerStaleMs(process.env.VOZEB_PRO_GENERATION_WORKER_STALE_MS);
    if (!isWorkerTokenConfigured()) return { required: true, healthy: false, lastHeartbeatAt: null, staleAfterMs, reason: "worker_token_missing" as const };
    const lastSeenAt = getDatabaseProvider() === "postgres" ? await latestGenerationWorkerHeartbeat() : latestFileHeartbeat();
    return {
        required: true,
        healthy: Boolean(lastSeenAt && now - lastSeenAt <= staleAfterMs),
        lastHeartbeatAt: lastSeenAt ? new Date(lastSeenAt).toISOString() : null,
        staleAfterMs,
        ...(!lastSeenAt ? { reason: "heartbeat_missing" as const } : now - lastSeenAt > staleAfterMs ? { reason: "heartbeat_stale" as const } : {}),
    };
}

function latestFileHeartbeat() {
    let latest = 0;
    for (const value of fileHeartbeats.values()) latest = Math.max(latest, value);
    return latest || undefined;
}
