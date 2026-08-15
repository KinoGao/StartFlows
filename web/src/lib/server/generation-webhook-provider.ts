import { createHmac, timingSafeEqual } from "node:crypto";

export const GENERATION_WEBHOOK_SECRET_MIN_LENGTH = 32;
export const GENERATION_WEBHOOK_MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;

export class GenerationWebhookVerificationError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

export type GenerationWebhookVerificationInput = {
    channelId: string;
    eventId: string;
    timestamp: string;
    rawBody: string;
    signature: string;
    secret: string;
    now?: number;
};

export function isGenerationWebhookSecretConfigured(value: unknown) {
    return typeof value === "string" && value.trim().length >= GENERATION_WEBHOOK_SECRET_MIN_LENGTH;
}

export function buildGenerationWebhookSignaturePayload(input: Pick<GenerationWebhookVerificationInput, "channelId" | "eventId" | "timestamp" | "rawBody">) {
    return `${JSON.stringify([input.channelId.trim(), input.timestamp.trim(), input.eventId.trim()])}\n${input.rawBody}`;
}

export function verifyGenerationWebhookSignature(input: GenerationWebhookVerificationInput) {
    const secret = input.secret.trim();
    if (!isGenerationWebhookSecretConfigured(secret)) throw new GenerationWebhookVerificationError("当前渠道未启用安全生成回调，请使用任务轮询", 409);

    const channelId = requiredHeaderValue(input.channelId, "生成回调渠道 ID");
    const eventId = requiredHeaderValue(input.eventId, "生成回调事件 ID");
    const timestamp = requiredHeaderValue(input.timestamp, "生成回调时间戳");
    const signature = normalizeSignature(input.signature);
    const timestampMs = parseTimestamp(timestamp);
    if (!Number.isFinite(timestampMs)) throw new GenerationWebhookVerificationError("生成回调时间戳无效", 400);
    if (Math.abs((input.now ?? Date.now()) - timestampMs) > GENERATION_WEBHOOK_MAX_CLOCK_SKEW_MS) throw new GenerationWebhookVerificationError("生成回调时间戳已过期", 401);
    if (!signature) throw new GenerationWebhookVerificationError("生成回调验签失败", 401);

    const expected = createHmac("sha256", secret)
        .update(buildGenerationWebhookSignaturePayload({ channelId, eventId, timestamp, rawBody: input.rawBody }), "utf8")
        .digest();
    const provided = Buffer.from(signature, "hex");
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new GenerationWebhookVerificationError("生成回调验签失败", 401);
    return { signatureTimestamp: new Date(timestampMs).toISOString() };
}

function requiredHeaderValue(value: string, label: string) {
    const result = value.trim();
    if (!result || /[\r\n]/.test(result)) throw new GenerationWebhookVerificationError(`${label}不能为空`, 400);
    return result;
}

function normalizeSignature(value: string) {
    const signature = value
        .trim()
        .replace(/^sha256=/i, "")
        .toLowerCase();
    return /^[a-f0-9]{64}$/.test(signature) ? signature : "";
}

function parseTimestamp(value: string) {
    if (/^\d{10}$/.test(value)) return Number(value) * 1_000;
    if (/^\d{13}$/.test(value)) return Number(value);
    return Date.parse(value);
}
