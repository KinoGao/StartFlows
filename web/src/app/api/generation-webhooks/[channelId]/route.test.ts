import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    verify: vi.fn(),
    record: vi.fn(),
    getAuthSettings: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.getAuthSettings }));
vi.mock("@/lib/server/generation-webhook-provider", () => ({
    GenerationWebhookVerificationError: class GenerationWebhookVerificationError extends Error {
        constructor(
            message: string,
            readonly status: number,
        ) {
            super(message);
        }
    },
    verifyGenerationWebhookSignature: mocks.verify,
}));
vi.mock("@/lib/server/generation-task-webhook", () => ({
    GenerationWebhookError: class GenerationWebhookError extends Error {
        constructor(
            message: string,
            readonly status: number,
        ) {
            super(message);
        }
    },
    recordGenerationWebhook: mocks.record,
}));

import { POST } from "./route";

describe("POST /api/generation-webhooks/:channelId", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.verify.mockReturnValue({ signatureTimestamp: "2026-08-01T00:00:00.000Z" });
        mocks.getAuthSettings.mockResolvedValue({ systemChannels: [{ id: "channel-one", enabled: true, webhookSecret: "0123456789abcdef0123456789abcdef", advancedConfig: { resultField: "data.url", statusField: "data.status" } }] });
        mocks.record.mockResolvedValue({ duplicate: false, matched: true, taskId: "video-one", resultReady: true });
    });

    it("rejects unsigned callbacks", async () => {
        const { GenerationWebhookVerificationError } = await import("@/lib/server/generation-webhook-provider");
        mocks.verify.mockImplementationOnce(() => {
            throw new GenerationWebhookVerificationError("生成回调验签失败", 401);
        });
        const response = await POST(request({}), context());
        expect(response.status).toBe(401);
        expect(mocks.record).not.toHaveBeenCalled();
    });

    it("parses configured result fields and forwards the raw body for idempotent processing", async () => {
        const body = { event: { id: "event-one" }, task_id: "upstream-one", data: { status: "completed", url: "https://cdn.example/video.mp4" }, metadata: { clientRequestId: "request-one" } };
        const response = await POST(request(body), context());

        expect(response.status).toBe(200);
        expect(mocks.record).toHaveBeenCalledWith({
            channelId: "channel-one",
            eventId: "event-one",
            upstreamTaskId: "upstream-one",
            upstreamStatus: "completed",
            resultUrl: "https://cdn.example/video.mp4",
            rawBody: JSON.stringify(body),
            signatureTimestamp: "2026-08-01T00:00:00.000Z",
        });
        expect(mocks.verify).toHaveBeenCalledWith({
            channelId: "channel-one",
            eventId: "event-one",
            timestamp: "2026-08-01T00:00:00.000Z",
            rawBody: JSON.stringify(body),
            signature: "signature",
            secret: "0123456789abcdef0123456789abcdef",
        });
    });
});

function request(body: unknown) {
    return new Request("http://localhost/api/generation-webhooks/channel-one", {
        method: "POST",
        headers: { "content-type": "application/json", "x-vozeb-pro-event-id": "event-one", "x-vozeb-pro-signature": "signature", "x-vozeb-pro-timestamp": "2026-08-01T00:00:00.000Z" },
        body: JSON.stringify(body),
    });
}

function context() {
    return { params: Promise.resolve({ channelId: "channel-one" }) };
}
