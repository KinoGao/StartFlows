import { getDatabaseProvider, getPostgresConnectionString, subscribePostgresNotification } from "@/lib/server/database";

type RunEventListener = () => void;

const CREATIVE_RUN_NOTIFY_CHANNEL = "vozeb_pro_run_events";
const globalSignals = globalThis as typeof globalThis & {
    __vozebProCreativeRunSignals?: Map<string, Set<RunEventListener>>;
    __vozebProCreativeRunSignalBridge?: Promise<unknown>;
};
const listeners = (globalSignals.__vozebProCreativeRunSignals ??= new Map<string, Set<RunEventListener>>());

export function notifyCreativeRunEvent(runId: string) {
    for (const listener of [...(listeners.get(runId) || [])]) listener();
}

export function waitForCreativeRunEvent(runId: string, timeoutMs: number, signal?: AbortSignal) {
    ensurePostgresEventBridge();
    return new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (notified: boolean) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            signal?.removeEventListener("abort", aborted);
            const current = listeners.get(runId);
            current?.delete(changed);
            if (current && !current.size) listeners.delete(runId);
            resolve(notified);
        };
        const changed = () => finish(true);
        const aborted = () => finish(false);
        const timeout = setTimeout(() => finish(false), timeoutMs);
        const current = listeners.get(runId) || new Set<RunEventListener>();
        current.add(changed);
        listeners.set(runId, current);
        if (signal?.aborted) aborted();
        else signal?.addEventListener("abort", aborted, { once: true });
    });
}

function ensurePostgresEventBridge() {
    if (getDatabaseProvider() !== "postgres" || !getPostgresConnectionString() || globalSignals.__vozebProCreativeRunSignalBridge) return;
    globalSignals.__vozebProCreativeRunSignalBridge = subscribePostgresNotification(CREATIVE_RUN_NOTIFY_CHANNEL, (runId) => {
        const id = runId.trim();
        if (id && id.length <= 160) notifyCreativeRunEvent(id);
    }).catch((error) => {
        globalSignals.__vozebProCreativeRunSignalBridge = undefined;
        console.warn("Creative run PostgreSQL notification bridge unavailable", { error: error instanceof Error ? error.message : String(error) });
    });
}
