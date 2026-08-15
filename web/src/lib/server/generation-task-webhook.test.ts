import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    provider: "postgres",
    query: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
    ensurePostgresSchema: vi.fn(),
    getDatabaseProvider: vi.fn(() => mocks.provider),
    withPostgresTransaction: vi.fn(async (handler: (client: { query: typeof mocks.query }) => unknown) => handler({ query: mocks.query })),
}));

import { GenerationWebhookError, recordGenerationWebhook } from "./generation-task-webhook";

describe("generation task webhook", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.provider = "postgres";
    });

    it("updates exactly one task by channel and upstream task id", async () => {
        mocks.query
            .mockResolvedValueOnce({ rows: [{ event_id: "event-one" }] })
            .mockResolvedValueOnce({ rows: [{ id: "video-one", task_type: "video" }] })
            .mockResolvedValueOnce({ rows: [] });

        const result = await recordGenerationWebhook(fixture());

        expect(result).toMatchObject({ duplicate: false, matched: true, taskId: "video-one", taskType: "video", resultReady: true });
        expect(String(mocks.query.mock.calls[0]?.[0])).toContain("signature_timestamp");
        const taskUpdate = String(mocks.query.mock.calls[1]?.[0]);
        expect(taskUpdate).toContain("channel_id = $1");
        expect(taskUpdate).toContain("upstream_task_id = $2");
        expect(taskUpdate).not.toContain("client_request_id");
        expect(taskUpdate).not.toContain(" OR ");
    });

    it("returns the persisted task state for an exact duplicate payload", async () => {
        mocks.query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ payload_hash: payloadHash("{}"), status: "result_ready", task_id: "video-one", task_type: "video" }] });

        await expect(recordGenerationWebhook({ ...fixture(), rawBody: "{}" })).resolves.toEqual({ duplicate: true, matched: true, taskId: "video-one", taskType: "video", resultReady: true });
        expect(mocks.query).toHaveBeenCalledTimes(2);
    });

    it("records and rejects an event id replayed with a different payload", async () => {
        mocks.query
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [{ payload_hash: payloadHash('{"old":true}'), status: "received", task_id: null, task_type: null }] })
            .mockResolvedValueOnce({ rows: [] });

        await expect(recordGenerationWebhook({ ...fixture(), rawBody: '{"new":true}' })).rejects.toEqual(expect.objectContaining<Partial<GenerationWebhookError>>({ status: 409 }));
        expect(String(mocks.query.mock.calls[2]?.[0])).toContain("conflict_count = conflict_count + 1");
        expect(mocks.query).toHaveBeenCalledTimes(3);
    });

    it("requires PostgreSQL for durable webhook idempotency", async () => {
        mocks.provider = "file";

        await expect(recordGenerationWebhook(fixture())).rejects.toEqual(expect.objectContaining<Partial<GenerationWebhookError>>({ status: 409 }));
    });
});

function fixture() {
    return {
        channelId: "channel-one",
        eventId: "event-one",
        upstreamTaskId: "upstream-one",
        upstreamStatus: "completed",
        resultUrl: "https://cdn.example/video.mp4",
        rawBody: "{}",
        signatureTimestamp: "2026-08-01T00:00:00.000Z",
    };
}

function payloadHash(body: string) {
    return createHash("sha256").update(body).digest("hex");
}
