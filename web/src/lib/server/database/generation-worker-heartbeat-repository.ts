import { ensurePostgresSchema, postgresQuery } from "./postgres";
import { GENERATION_WORKER_HEARTBEAT_MAX_STALE_MS } from "../generation-worker-heartbeat-policy";

export async function upsertGenerationWorkerHeartbeat(workerId: string, at: Date) {
    await ensurePostgresSchema();
    await postgresQuery(
        `INSERT INTO generation_worker_heartbeats (worker_id, last_seen_at)
         VALUES ($1, $2)
         ON CONFLICT (worker_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`,
        [workerId, at],
    );
    await postgresQuery("DELETE FROM generation_worker_heartbeats WHERE last_seen_at < $1", [new Date(at.getTime() - GENERATION_WORKER_HEARTBEAT_MAX_STALE_MS)]);
}

export async function latestGenerationWorkerHeartbeat() {
    const result = await postgresQuery<{ last_seen_at: Date | string }>("SELECT last_seen_at FROM generation_worker_heartbeats ORDER BY last_seen_at DESC LIMIT 1");
    const value = result.rows[0]?.last_seen_at;
    if (!value) return undefined;
    const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
    return Number.isFinite(time) ? time : undefined;
}
