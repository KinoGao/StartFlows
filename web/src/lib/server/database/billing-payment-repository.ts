import type { QueryExecutor } from "@/lib/server/database/postgres";
import type {
    BillingReconciliationRowRecord,
    BillingReconciliationRunRecord,
    PageInput,
    PageResult,
    PaymentProviderEventRecord,
    PaymentTransactionRecord,
    PaymentTransactionStatus,
    PlanAssignmentSource,
    PlanAssignmentStatus,
    UserPlanAssignmentRecord,
} from "./repository-shared";
import { jsonParam, mapBillingReconciliationRow, mapBillingReconciliationRun, mapPaymentProviderEvent, mapPaymentTransaction, mapUserPlanAssignment, normalizePage, normalizePageSize, pageResult } from "./repository-shared";

export class BillingPaymentRepository {
    constructor(private readonly db: QueryExecutor) {}

    async upsertPayment(payment: PaymentTransactionRecord) {
        const result = await this.db.query(
            `
            INSERT INTO payment_transactions (
                id, order_id, user_id, provider, channel, status, amount_cents, currency, provider_trade_id,
                provider_payment_id, raw_payload, paid_at, refunded_at, failed_at, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            ON CONFLICT (id) DO NOTHING
            RETURNING *
            `,
            [
                payment.id,
                payment.orderId,
                payment.userId || null,
                payment.provider,
                payment.channel,
                payment.status,
                payment.amountCents,
                payment.currency,
                payment.providerTradeId || null,
                payment.providerPaymentId || null,
                jsonParam(payment.rawPayload ?? {}),
                payment.paidAt || null,
                payment.refundedAt || null,
                payment.failedAt || null,
                payment.createdAt,
                payment.updatedAt,
            ],
        );
        if (result.rows[0]) return mapPaymentTransaction(result.rows[0]);
        const existing = await this.db.query("SELECT * FROM payment_transactions WHERE id = $1", [payment.id]);
        if (!existing.rows[0]) throw new Error("Payment transaction conflict could not be resolved");
        return mapPaymentTransaction(existing.rows[0]);
    }

    async updatePaymentState(payment: PaymentTransactionRecord) {
        const result = await this.db.query(
            `UPDATE payment_transactions SET
                status = $4,
                raw_payload = $5,
                paid_at = $6,
                refunded_at = $7,
                failed_at = $8,
                updated_at = $9
             WHERE id = $1 AND order_id = $2 AND provider = $3
             RETURNING *`,
            [payment.id, payment.orderId, payment.provider, payment.status, jsonParam(payment.rawPayload ?? {}), payment.paidAt || null, payment.refundedAt || null, payment.failedAt || null, payment.updatedAt],
        );
        if (!result.rows[0]) throw new Error("Payment transaction state update target was not found");
        return mapPaymentTransaction(result.rows[0]);
    }

    async listPayments(input: PageInput & { orderId?: string; userId?: string; provider?: string; status?: PaymentTransactionStatus } = {}): Promise<PageResult<PaymentTransactionRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const result = await this.db.query(
            `
            SELECT *, count(*) OVER() AS total_count
            FROM payment_transactions
            WHERE ($1::text IS NULL OR order_id = $1)
              AND ($2::text IS NULL OR user_id = $2)
              AND ($3::text IS NULL OR provider = $3)
              AND ($4::text IS NULL OR status = $4)
            ORDER BY created_at DESC
            LIMIT $5 OFFSET $6
            `,
            [input.orderId || null, input.userId || null, input.provider || null, input.status || null, pageSize, (page - 1) * pageSize],
        );
        return pageResult(result.rows.map(mapPaymentTransaction), Number(result.rows[0]?.total_count || 0), page, pageSize);
    }

    async listPaymentsByOrderId(orderId: string) {
        const result = await this.db.query("SELECT * FROM payment_transactions WHERE order_id = $1 ORDER BY created_at DESC, id DESC", [orderId]);
        return result.rows.map(mapPaymentTransaction);
    }

    async findOrderPayment(input: { orderId: string; preferredPaymentId?: string; statuses: PaymentTransactionStatus[] }) {
        const statuses = [...new Set(input.statuses)];
        const result = await this.db.query(
            `SELECT * FROM payment_transactions
             WHERE order_id = $1
               AND (($2::text IS NOT NULL AND id = $2) OR status = ANY($3::text[]))
             ORDER BY CASE WHEN id = $2 THEN 0 ELSE 1 END, created_at DESC, id DESC
             LIMIT 1`,
            [input.orderId, input.preferredPaymentId?.trim() || null, statuses],
        );
        return result.rows[0] ? mapPaymentTransaction(result.rows[0]) : null;
    }

    async lockPaymentIdentity(provider: string, identifiers: string[]) {
        const values = [...new Set(identifiers.map((item) => item.trim()).filter(Boolean))].sort();
        for (const identifier of values) await this.db.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`${provider}:${identifier}`]);
    }

    async getPaymentByProviderIdentifiers(provider: string, identifiers: string[], forUpdate = false) {
        const values = identifiers.map((item) => item.trim()).filter(Boolean);
        if (!values.length) return null;
        const result = await this.db.query(
            `
            SELECT *
            FROM payment_transactions
            WHERE provider = $1
              AND (provider_trade_id = ANY($2::text[]) OR provider_payment_id = ANY($2::text[]))
            ORDER BY created_at DESC
            LIMIT 1
            ${forUpdate ? "FOR UPDATE" : ""}
            `,
            [provider, values],
        );
        return result.rows[0] ? mapPaymentTransaction(result.rows[0]) : null;
    }

    async getPaymentByProviderIdentifier(provider: string, identifier: string, forUpdate = false) {
        return this.getPaymentByProviderIdentifiers(provider, [identifier], forUpdate);
    }

    async createReconciliationRun(run: BillingReconciliationRunRecord, rows: BillingReconciliationRowRecord[]) {
        const result = await this.db.query(
            `
            INSERT INTO billing_reconciliation_runs (
                id, provider, source, status, total_rows, matched_rows, ok_rows, issue_rows,
                statement_paid_amount_cents, statement_refunded_amount_cents, local_matched_amount_cents,
                difference_amount_cents, imported_by_user_id, imported_by_username, file_name, file_hash, note,
                metadata, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
            ON CONFLICT (provider, file_hash) WHERE file_hash IS NOT NULL AND file_hash <> '' DO NOTHING
            RETURNING *
            `,
            [
                run.id,
                run.provider,
                run.source,
                run.status,
                run.totalRows,
                run.matchedRows,
                run.okRows,
                run.issueRows,
                run.statementPaidAmountCents,
                run.statementRefundedAmountCents,
                run.localMatchedAmountCents,
                run.differenceAmountCents,
                run.importedByUserId || null,
                run.importedByUsername || null,
                run.fileName || null,
                run.fileHash || null,
                run.note || null,
                jsonParam(run.metadata ?? {}),
                run.createdAt,
                run.updatedAt,
            ],
        );
        if (!result.rows[0]) return null;
        for (const row of rows) {
            await this.db.query(
                `
                INSERT INTO billing_reconciliation_rows (
                    id, run_id, row_number, row_key, provider, order_no, provider_order_id,
                    provider_payment_id, statement_status, amount_cents, currency, local_order_id,
                    local_order_no, local_order_status, local_amount_cents, local_currency,
                    issue_codes, issues, created_at, updated_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
                `,
                [
                    row.id,
                    row.runId,
                    row.rowNumber,
                    row.rowKey,
                    row.provider,
                    row.orderNo || null,
                    row.providerOrderId || null,
                    row.providerPaymentId || null,
                    row.statementStatus,
                    row.amountCents ?? null,
                    row.currency || null,
                    row.localOrderId || null,
                    row.localOrderNo || null,
                    row.localOrderStatus || null,
                    row.localAmountCents ?? null,
                    row.localCurrency || null,
                    jsonParam(row.issueCodes),
                    jsonParam(row.issues),
                    row.createdAt,
                    row.updatedAt,
                ],
            );
        }
        return mapBillingReconciliationRun(result.rows[0]);
    }

    async getReconciliationRunByFileHash(provider: string, fileHash: string) {
        const result = await this.db.query("SELECT * FROM billing_reconciliation_runs WHERE provider = $1 AND file_hash = $2 LIMIT 1", [provider, fileHash]);
        return result.rows[0] ? mapBillingReconciliationRun(result.rows[0]) : null;
    }

    async listReconciliationRuns(input: PageInput & { provider?: string } = {}): Promise<PageResult<BillingReconciliationRunRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const result = await this.db.query(
            `
            SELECT *, count(*) OVER() AS total_count
            FROM billing_reconciliation_runs
            WHERE ($1::text IS NULL OR provider = $1)
            ORDER BY created_at DESC
            LIMIT $2 OFFSET $3
            `,
            [input.provider || null, pageSize, (page - 1) * pageSize],
        );
        return pageResult(result.rows.map(mapBillingReconciliationRun), Number(result.rows[0]?.total_count || 0), page, pageSize);
    }

    async getReconciliationRun(id: string) {
        const result = await this.db.query("SELECT * FROM billing_reconciliation_runs WHERE id = $1", [id]);
        return result.rows[0] ? mapBillingReconciliationRun(result.rows[0]) : null;
    }

    async listReconciliationRows(input: PageInput & { runId: string }): Promise<PageResult<BillingReconciliationRowRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const result = await this.db.query(
            `
            SELECT *, count(*) OVER() AS total_count
            FROM billing_reconciliation_rows
            WHERE run_id = $1
            ORDER BY row_number ASC
            LIMIT $2 OFFSET $3
            `,
            [input.runId, pageSize, (page - 1) * pageSize],
        );
        return pageResult(result.rows.map(mapBillingReconciliationRow), Number(result.rows[0]?.total_count || 0), page, pageSize);
    }

    async createPlanAssignment(assignment: UserPlanAssignmentRecord) {
        const result = await this.db.query(
            `
            INSERT INTO user_plan_assignments (id, user_id, plan_id, status, source, source_id, starts_at, ends_at, metadata, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (source, source_id) WHERE source_id IS NOT NULL AND source_id <> '' DO UPDATE SET
                user_id = EXCLUDED.user_id,
                plan_id = EXCLUDED.plan_id,
                status = EXCLUDED.status,
                starts_at = EXCLUDED.starts_at,
                ends_at = EXCLUDED.ends_at,
                metadata = EXCLUDED.metadata
            RETURNING *
            `,
            [
                assignment.id,
                assignment.userId,
                assignment.planId,
                assignment.status,
                assignment.source,
                assignment.sourceId || null,
                assignment.startsAt,
                assignment.endsAt || null,
                jsonParam(assignment.metadata ?? {}),
                assignment.createdAt,
                assignment.updatedAt,
            ],
        );
        return mapUserPlanAssignment(result.rows[0]);
    }

    async getActivePlanAssignment(userId: string, at = new Date(), forUpdate = false) {
        const result = await this.db.query(
            `
            SELECT *
            FROM user_plan_assignments
            WHERE user_id = $1
              AND status = 'active'
              AND starts_at <= $2
              AND (ends_at IS NULL OR ends_at > $2)
            ORDER BY starts_at DESC, created_at DESC, id DESC
            LIMIT 1
            ${forUpdate ? "FOR UPDATE" : ""}
            `,
            [userId, at.toISOString()],
        );
        return result.rows[0] ? mapUserPlanAssignment(result.rows[0]) : null;
    }

    async getPlanAssignmentBySource(source: PlanAssignmentSource, sourceId: string) {
        const result = await this.db.query("SELECT * FROM user_plan_assignments WHERE source = $1 AND source_id = $2 LIMIT 1", [source, sourceId]);
        return result.rows[0] ? mapUserPlanAssignment(result.rows[0]) : null;
    }

    async listPlanAssignments(input: PageInput & { userId?: string; planId?: string; status?: PlanAssignmentStatus; source?: PlanAssignmentSource } = {}): Promise<PageResult<UserPlanAssignmentRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const result = await this.db.query(
            `
            SELECT *, count(*) OVER() AS total_count
            FROM user_plan_assignments
            WHERE ($1::text IS NULL OR user_id = $1)
              AND ($2::text IS NULL OR plan_id = $2)
              AND ($3::text IS NULL OR status = $3)
              AND ($4::text IS NULL OR source = $4)
            ORDER BY created_at DESC
            LIMIT $5 OFFSET $6
            `,
            [input.userId || null, input.planId || null, input.status || null, input.source || null, pageSize, (page - 1) * pageSize],
        );
        return pageResult(result.rows.map(mapUserPlanAssignment), Number(result.rows[0]?.total_count || 0), page, pageSize);
    }

    async updatePlanAssignment(id: string, patch: Partial<Omit<UserPlanAssignmentRecord, "id" | "userId" | "createdAt" | "updatedAt">>) {
        const result = await this.db.query(
            `
            UPDATE user_plan_assignments SET
                plan_id = COALESCE($2, plan_id),
                status = COALESCE($3, status),
                source = COALESCE($4, source),
                source_id = COALESCE($5, source_id),
                starts_at = COALESCE($6, starts_at),
                ends_at = COALESCE($7, ends_at),
                metadata = COALESCE($8::jsonb, metadata)
            WHERE id = $1
            RETURNING *
            `,
            [id, patch.planId, patch.status, patch.source, patch.sourceId, patch.startsAt, patch.endsAt, jsonParam(patch.metadata)],
        );
        return result.rows[0] ? mapUserPlanAssignment(result.rows[0]) : null;
    }

    async upsertProviderEvent(event: PaymentProviderEventRecord) {
        const eventId = event.eventId || event.id;
        const result = await this.db.query(
            `
            INSERT INTO payment_provider_events (id, provider, event_id, event_type, order_id, signature_valid, payload, processing_at, processed_at, error, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (provider, event_id) WHERE event_id IS NOT NULL AND event_id <> '' DO NOTHING
            RETURNING *
            `,
            [event.id, event.provider, eventId, event.eventType, event.orderId || null, event.signatureValid, jsonParam(event.payload ?? {}), event.processingAt || null, event.processedAt || null, event.error || null, event.createdAt, event.updatedAt],
        );
        if (result.rows[0]) return { event: mapPaymentProviderEvent(result.rows[0]), conflict: false };
        const existing = await this.getProviderEventByProviderEventId(event.provider, eventId);
        if (!existing) throw new Error("Payment provider event conflict could not be resolved");
        return { event: existing, conflict: !sameProviderEvent(existing, event) };
    }

    async getProviderEventByProviderEventId(provider: string, eventId: string) {
        const result = await this.db.query("SELECT * FROM payment_provider_events WHERE provider = $1 AND event_id = $2", [provider, eventId]);
        return result.rows[0] ? mapPaymentProviderEvent(result.rows[0]) : null;
    }

    async claimProviderEvent(id: string) {
        const result = await this.db.query("UPDATE payment_provider_events SET processing_at = now(), updated_at = now() WHERE id = $1 AND processed_at IS NULL AND (processing_at IS NULL OR processing_at < now() - interval '5 minutes') RETURNING *", [
            id,
        ]);
        return result.rows[0] ? mapPaymentProviderEvent(result.rows[0]) : null;
    }

    async markProviderEventProcessed(id: string, error?: string) {
        const result = await this.db.query("UPDATE payment_provider_events SET processing_at = NULL, processed_at = now(), error = $2, updated_at = now() WHERE id = $1 RETURNING *", [id, error || null]);
        return result.rows[0] ? mapPaymentProviderEvent(result.rows[0]) : null;
    }

    async markProviderEventConflict(id: string) {
        const result = await this.db.query("UPDATE payment_provider_events SET error = 'event_payload_conflict', updated_at = now() WHERE id = $1 RETURNING *", [id]);
        return result.rows[0] ? mapPaymentProviderEvent(result.rows[0]) : null;
    }

    async releaseProviderEvent(id: string, error?: string) {
        const result = await this.db.query("UPDATE payment_provider_events SET processing_at = NULL, error = $2, updated_at = now() WHERE id = $1 AND processed_at IS NULL RETURNING *", [id, error || null]);
        return result.rows[0] ? mapPaymentProviderEvent(result.rows[0]) : null;
    }
}

function sameProviderEvent(existing: PaymentProviderEventRecord, incoming: PaymentProviderEventRecord) {
    return existing.eventType === incoming.eventType && (existing.orderId || "") === (incoming.orderId || "") && existing.signatureValid === incoming.signatureValid && stableJson(existing.payload ?? {}) === stableJson(incoming.payload ?? {});
}

function stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value) ?? "null";
}
