import { createHash } from "node:crypto";

import { ensurePostgresSchema, getDatabaseProvider, withPostgresTransaction } from "@/lib/server/database";
import type { GenerationTaskType } from "@/lib/server/generation-task-store";

export class GenerationWebhookError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

type WebhookEventRow = {
    payload_hash: string;
    status: string;
    task_id: string | null;
    task_type: GenerationTaskType | null;
};

type WebhookResult = {
    duplicate: boolean;
    matched: boolean;
    taskId?: string;
    taskType?: GenerationTaskType;
    resultReady: boolean;
};

export async function recordGenerationWebhook(input: { channelId: string; eventId: string; upstreamTaskId: string; upstreamStatus?: string; resultUrl?: string; rawBody: string; signatureTimestamp: string }) {
    if (getDatabaseProvider() !== "postgres") throw new GenerationWebhookError("生成回调幂等处理需要 PostgreSQL", 409);
    const channelId = required(input.channelId, "回调渠道 ID", 160);
    const eventId = required(input.eventId, "回调事件 ID", 300);
    const upstreamTaskId = required(input.upstreamTaskId, "上游任务 ID", 500);
    const upstreamStatus = clean(input.upstreamStatus, 160) || "webhook_received";
    const resultUrl = clean(input.resultUrl, 4_000);
    const signatureTimestamp = requiredIsoDate(input.signatureTimestamp);
    const payloadHash = createHash("sha256").update(input.rawBody, "utf8").digest("hex");
    await ensurePostgresSchema();

    const outcome = await withPostgresTransaction(async (client): Promise<WebhookResult | { conflict: true }> => {
        const inserted = await client.query<{ event_id: string }>(
            `INSERT INTO generation_webhook_events (channel_id, event_id, upstream_task_id, payload_hash, signature_timestamp, status)
             VALUES ($1, $2, $3, $4, $5, 'received')
             ON CONFLICT (channel_id, event_id) DO NOTHING
             RETURNING event_id`,
            [channelId, eventId, upstreamTaskId, payloadHash, signatureTimestamp],
        );
        if (!inserted.rows[0]) {
            const existing = await client.query<WebhookEventRow>(
                `SELECT payload_hash, status, task_id, task_type
                 FROM generation_webhook_events
                 WHERE channel_id = $1 AND event_id = $2
                 FOR UPDATE`,
                [channelId, eventId],
            );
            const event = existing.rows[0];
            if (!event) throw new GenerationWebhookError("生成回调事件读取失败", 409);
            if (event.payload_hash !== payloadHash) {
                await client.query(
                    `UPDATE generation_webhook_events
                     SET conflict_count = conflict_count + 1,
                         last_conflict_payload_hash = $3,
                         last_conflict_at = now()
                     WHERE channel_id = $1 AND event_id = $2`,
                    [channelId, eventId, payloadHash],
                );
                return { conflict: true };
            }
            return duplicateResult(event);
        }

        const task = await client.query<{ id: string; task_type: GenerationTaskType }>(
            `UPDATE generation_tasks
             SET execution_phase = CASE WHEN $4::text IS NOT NULL THEN 'result_ready' ELSE execution_phase END,
                 result_payload = CASE WHEN $4::text IS NOT NULL THEN jsonb_build_object('url', $4::text) ELSE result_payload END,
                 next_poll_at = now(), last_upstream_status = $3,
                 worker_id = NULL, lease_until = NULL
             WHERE channel_id = $1
               AND upstream_task_id = $2
               AND task_type IN ('image', 'video', 'audio')
               AND status IN ('pending', 'running')
               AND execution_phase IN ('submitted', 'polling', 'result_ready', 'persisting')
             RETURNING id, task_type`,
            [channelId, upstreamTaskId, upstreamStatus, resultUrl || null],
        );
        const matched = task.rows[0];
        const status = matched ? (resultUrl ? "result_ready" : "poll_scheduled") : "unmatched";
        await client.query(
            `UPDATE generation_webhook_events
             SET task_id = $3, task_type = $4, status = $5, processed_at = now()
             WHERE channel_id = $1 AND event_id = $2`,
            [channelId, eventId, matched?.id || null, matched?.task_type || null, status],
        );
        return { duplicate: false, matched: Boolean(matched), taskId: matched?.id, taskType: matched?.task_type, resultReady: status === "result_ready" };
    });

    if ("conflict" in outcome) throw new GenerationWebhookError("同一生成回调事件 ID 对应了不同载荷", 409);
    return outcome;
}

function duplicateResult(event: WebhookEventRow): WebhookResult {
    return {
        duplicate: true,
        matched: Boolean(event.task_id),
        taskId: event.task_id || undefined,
        taskType: event.task_type || undefined,
        resultReady: event.status === "result_ready",
    };
}

function requiredIsoDate(value: unknown) {
    const raw = required(value, "回调签名时间", 80);
    const parsed = Date.parse(raw);
    if (!Number.isFinite(parsed)) throw new GenerationWebhookError("回调签名时间无效", 400);
    return new Date(parsed).toISOString();
}

function required(value: unknown, label: string, max: number) {
    const result = clean(value, max);
    if (!result) throw new GenerationWebhookError(`${label}不能为空`, 400);
    return result;
}

function clean(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) || undefined : undefined;
}
