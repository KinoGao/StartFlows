import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    notify: undefined as ((payload: string) => void) | undefined,
    subscribe: vi.fn(async (_channel: string, listener: (payload: string) => void) => {
        mocks.notify = listener;
        return () => undefined;
    }),
}));

vi.mock("@/lib/server/database", () => ({
    getDatabaseProvider: vi.fn(() => "postgres"),
    getPostgresConnectionString: vi.fn(() => "postgres://fixture"),
    subscribePostgresNotification: mocks.subscribe,
}));

import { notifyCreativeRunEvent, waitForCreativeRunEvent } from "./creative-run-event-signal";

describe("creative run event signal", () => {
    it("wakes a waiting SSE loop immediately when the run changes", async () => {
        const waiting = waitForCreativeRunEvent("run-one", 10_000);
        notifyCreativeRunEvent("run-one");
        await expect(waiting).resolves.toBe(true);
    });

    it("keeps a timeout fallback for changes from another process", async () => {
        vi.useFakeTimers();
        const waiting = waitForCreativeRunEvent("run-timeout", 2_500);
        await vi.advanceTimersByTimeAsync(2_500);
        await expect(waiting).resolves.toBe(false);
        vi.useRealTimers();
    });

    it("wakes the local SSE waiter from a PostgreSQL notification", async () => {
        const waiting = waitForCreativeRunEvent("run-remote", 10_000);
        await vi.waitFor(() => expect(mocks.subscribe).toHaveBeenCalledWith("vozeb_pro_run_events", expect.any(Function)));
        mocks.notify?.("run-remote");
        await expect(waiting).resolves.toBe(true);
    });
});
