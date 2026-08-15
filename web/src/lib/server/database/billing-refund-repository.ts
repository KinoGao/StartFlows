import type { QueryExecutor } from "@/lib/server/database/postgres";
import { jsonParam, optionalIso, optionalJson, optionalString, stringValue } from "./repository-shared";

export type BillingRefundJobStatus = "pending" | "processing" | "compensating" | "completed" | "manual" | "failed";

export type BillingRefundJobRecord = {
    id: string;
    orderId: string;
    paymentId?: string;
    provider: string;
    status: BillingRefundJobStatus;
    providerRefundId?: string;
    attempts: number;
    nextAttemptAt?: string;
    lastError?: string;
    rawPayload?: import("./repository-shared").JsonValue;
    workerId?: string;
    leaseUntil?: string;
    completedAt?: string;
    createdAt: string;
    updatedAt: string;
};

export class BillingRefundRepository {
    constructor(private readonly db: QueryExecutor) {}

    async getByOrderId(orderId: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM billing_refund_jobs WHERE order_id = $1 ${forUpdate ? "FOR UPDATE" : ""}`, [orderId]);
        return result.rows[0] ? mapBillingRefundJob(result.rows[0]) : null;
    }

    async upsert(job: BillingRefundJobRecord) {
        const result = await this.db.query(
            `INSERT INTO billing_refund_jobs (
                id, order_id, payment_id, provider, status, provider_refund_id, attempts,
                next_attempt_at, last_error, raw_payload, worker_id, lease_until, completed_at, created_at, updated_at
             ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
             ON CONFLICT (order_id) DO UPDATE SET
                payment_id = COALESCE(EXCLUDED.payment_id, billing_refund_jobs.payment_id),
                provider = EXCLUDED.provider,
                status = EXCLUDED.status,
                provider_refund_id = COALESCE(EXCLUDED.provider_refund_id, billing_refund_jobs.provider_refund_id),
                attempts = EXCLUDED.attempts,
                next_attempt_at = EXCLUDED.next_attempt_at,
                last_error = EXCLUDED.last_error,
                raw_payload = EXCLUDED.raw_payload,
                worker_id = EXCLUDED.worker_id,
                lease_until = EXCLUDED.lease_until,
                completed_at = EXCLUDED.completed_at,
                updated_at = EXCLUDED.updated_at
             RETURNING *`,
            [
                job.id,
                job.orderId,
                job.paymentId || null,
                job.provider,
                job.status,
                job.providerRefundId || null,
                job.attempts,
                job.nextAttemptAt || null,
                job.lastError || null,
                jsonParam(job.rawPayload ?? {}),
                job.workerId || null,
                job.leaseUntil || null,
                job.completedAt || null,
                job.createdAt,
                job.updatedAt,
            ],
        );
        return mapBillingRefundJob(result.rows[0]);
    }

    async claimDue(input: { workerId: string; now: string; leaseUntil: string; limit: number }) {
        const result = await this.db.query(
            `WITH due AS (
                SELECT id
                FROM billing_refund_jobs
                WHERE status IN ('pending', 'processing', 'compensating')
                  AND next_attempt_at IS NOT NULL AND next_attempt_at <= $1
                  AND (lease_until IS NULL OR lease_until <= $1)
                ORDER BY next_attempt_at ASC, id ASC
                FOR UPDATE SKIP LOCKED
                LIMIT $2
             )
             UPDATE billing_refund_jobs AS job
             SET status = CASE WHEN job.status = 'compensating' THEN 'compensating' ELSE 'processing' END,
                 worker_id = $3,
                 lease_until = $4,
                 attempts = attempts + 1,
                 updated_at = $1
             FROM due
             WHERE job.id = due.id
             RETURNING job.*`,
            [input.now, input.limit, input.workerId, input.leaseUntil],
        );
        return result.rows.map(mapBillingRefundJob);
    }

    async checkpoint(id: string, workerId: string, patch: Partial<Pick<BillingRefundJobRecord, "status" | "providerRefundId" | "nextAttemptAt" | "lastError" | "rawPayload">>) {
        const result = await this.db.query(
            `UPDATE billing_refund_jobs SET
                status = COALESCE($3, status),
                provider_refund_id = COALESCE($4, provider_refund_id),
                next_attempt_at = $5,
                last_error = $6,
                raw_payload = COALESCE($7::jsonb, raw_payload),
                updated_at = now()
             WHERE id = $1 AND worker_id = $2
             RETURNING *`,
            [id, workerId, patch.status || null, patch.providerRefundId || null, patch.nextAttemptAt || null, patch.lastError || null, patch.rawPayload === undefined ? null : jsonParam(patch.rawPayload)],
        );
        return result.rows[0] ? mapBillingRefundJob(result.rows[0]) : null;
    }

    async release(id: string, workerId: string, patch: Pick<BillingRefundJobRecord, "status" | "attempts"> & Partial<Pick<BillingRefundJobRecord, "providerRefundId" | "nextAttemptAt" | "lastError" | "rawPayload" | "completedAt">>) {
        const result = await this.db.query(
            `UPDATE billing_refund_jobs SET
                status = $3,
                provider_refund_id = COALESCE($4, provider_refund_id),
                attempts = $5,
                next_attempt_at = $6,
                last_error = $7,
                raw_payload = COALESCE($8::jsonb, raw_payload),
                completed_at = $9,
                worker_id = NULL,
                lease_until = NULL,
                updated_at = now()
             WHERE id = $1 AND worker_id = $2
             RETURNING *`,
            [id, workerId, patch.status, patch.providerRefundId || null, patch.attempts, patch.nextAttemptAt || null, patch.lastError || null, patch.rawPayload === undefined ? null : jsonParam(patch.rawPayload), patch.completedAt || null],
        );
        return result.rows[0] ? mapBillingRefundJob(result.rows[0]) : null;
    }
}

function mapBillingRefundJob(row: Record<string, unknown>): BillingRefundJobRecord {
    const status = stringValue(row.status);
    return {
        id: stringValue(row.id),
        orderId: stringValue(row.order_id),
        paymentId: optionalString(row.payment_id),
        provider: stringValue(row.provider),
        status: isStatus(status) ? status : "failed",
        providerRefundId: optionalString(row.provider_refund_id),
        attempts: Math.max(0, Math.floor(Number(row.attempts) || 0)),
        nextAttemptAt: optionalIso(row.next_attempt_at),
        lastError: optionalString(row.last_error),
        rawPayload: optionalJson(row.raw_payload),
        workerId: optionalString(row.worker_id),
        leaseUntil: optionalIso(row.lease_until),
        completedAt: optionalIso(row.completed_at),
        createdAt: optionalIso(row.created_at) || new Date(0).toISOString(),
        updatedAt: optionalIso(row.updated_at) || new Date(0).toISOString(),
    };
}

function isStatus(value: string): value is BillingRefundJobStatus {
    return value === "pending" || value === "processing" || value === "compensating" || value === "completed" || value === "manual" || value === "failed";
}
