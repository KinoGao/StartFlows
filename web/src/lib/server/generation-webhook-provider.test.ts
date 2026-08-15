import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { buildGenerationWebhookSignaturePayload, GenerationWebhookVerificationError, verifyGenerationWebhookSignature } from "./generation-webhook-provider";

const secret = "0123456789abcdef0123456789abcdef";
const now = Date.parse("2026-08-01T00:00:00.000Z");

describe("generation webhook provider", () => {
    it("binds the signature to channel, timestamp, event id, and raw body", () => {
        const input = fixture();
        const signature = sign(input);

        expect(verifyGenerationWebhookSignature({ ...input, signature, secret, now })).toEqual({ signatureTimestamp: "2026-08-01T00:00:00.000Z" });
        for (const patch of [{ channelId: "channel-two" }, { eventId: "event-two" }, { timestamp: "2026-08-01T00:00:01.000Z" }, { rawBody: `${input.rawBody} ` }]) {
            expect(() => verifyGenerationWebhookSignature({ ...input, ...patch, signature, secret, now })).toThrowError(expect.objectContaining<Partial<GenerationWebhookVerificationError>>({ status: 401 }));
        }
    });

    it("rejects expired timestamps and short channel secrets", () => {
        const input = fixture();
        expect(() => verifyGenerationWebhookSignature({ ...input, signature: sign(input), secret, now: now + 5 * 60 * 1_000 + 1 })).toThrowError(expect.objectContaining<Partial<GenerationWebhookVerificationError>>({ status: 401 }));
        expect(() => verifyGenerationWebhookSignature({ ...input, signature: sign(input), secret: "short", now })).toThrowError(expect.objectContaining<Partial<GenerationWebhookVerificationError>>({ status: 409 }));
    });
});

function fixture() {
    return { channelId: "channel-one", eventId: "event-one", timestamp: "2026-08-01T00:00:00.000Z", rawBody: JSON.stringify({ task_id: "upstream-one" }) };
}

function sign(input: ReturnType<typeof fixture>) {
    return createHmac("sha256", secret).update(buildGenerationWebhookSignaturePayload(input)).digest("hex");
}
