import { createHash } from "node:crypto";

import type { BillingReconciliationIssue, BillingReconciliationIssueCode, BillingReconciliationResult, BillingReconciliationRow, BillingStatementStatus } from "@/lib/admin-billing-types";
import { BillingInputError } from "@/lib/server/billing-errors";
import {
    createPostgresRepositories,
    ensurePostgresSchema,
    isPostgresDatabaseEnabled,
    withPostgresTransaction,
    type BillingOrderRecord,
    type BillingReconciliationRowRecord,
    type BillingReconciliationRunRecord,
    type JsonValue,
    type PaymentTransactionRecord,
} from "@/lib/server/database";
import {
    buildStoredReconciliationResult,
    createBillingReconciliationPersistenceRecords,
    localOrderMatchesStatement,
    MAX_STATEMENT_ROWS,
    normalizeInteger,
    normalizeOptionalProvider,
    normalizeProvider,
    normalizeText,
    parsePaymentStatementCsv,
    reconcilePaymentStatementRows,
    reconciliationLookupCacheKey,
    statementIdentifiers,
    type BillingReconciliationActor,
    type LocalBillingReconciliationRecord,
    type PaymentStatementRow,
} from "./payment-reconciliation-core";

type ReconcileBillingStatementInput = {
    provider?: unknown;
    csvText?: unknown;
    fileName?: unknown;
    note?: unknown;
};

type ListBillingReconciliationRunsInput = {
    page?: unknown;
    pageSize?: unknown;
    provider?: unknown;
};

export type { BillingReconciliationActor, LocalBillingReconciliationRecord, PaymentStatementRow } from "./payment-reconciliation-core";
export { createBillingReconciliationPersistenceRecords, parsePaymentStatementCsv, reconcilePaymentStatementRows } from "./payment-reconciliation-core";

export async function listBillingReconciliationRuns(input: ListBillingReconciliationRunsInput = {}) {
    if (!isPostgresDatabaseEnabled()) throw new BillingInputError("支付对账需要启用 PostgreSQL", 501);
    await ensurePostgresSchema();
    const provider = normalizeOptionalProvider(input.provider);
    return createPostgresRepositories().billing.listReconciliationRuns({
        page: normalizeInteger(input.page, 1, 1, 10_000),
        pageSize: normalizeInteger(input.pageSize, 10, 1, 50),
        provider,
    });
}

export async function getBillingReconciliationRun(id: string): Promise<BillingReconciliationResult | null> {
    if (!isPostgresDatabaseEnabled()) throw new BillingInputError("支付对账需要启用 PostgreSQL", 501);
    await ensurePostgresSchema();
    const repos = createPostgresRepositories();
    const run = await repos.billing.getReconciliationRun(normalizeText(id, "", 120));
    if (!run) return null;
    const rows = await repos.billing.listReconciliationRows({ runId: run.id, page: 1, pageSize: MAX_STATEMENT_ROWS });
    return buildStoredReconciliationResult(run, rows.items);
}

export async function importBillingStatement(input: ReconcileBillingStatementInput, actor: BillingReconciliationActor = {}): Promise<BillingReconciliationResult> {
    if (!isPostgresDatabaseEnabled()) throw new BillingInputError("支付对账需要启用 PostgreSQL", 501);
    await ensurePostgresSchema();
    const provider = normalizeProvider(input.provider);
    const csvText = normalizeText(input.csvText, "", 200_000);
    const fileHash = createHash("sha256").update(csvText, "utf8").digest("hex");
    const repos = createPostgresRepositories();
    if (await repos.billing.getReconciliationRunByFileHash(provider, fileHash)) throw new BillingInputError("该支付渠道的同一账单文件已经导入", 409);
    const result = await reconcileBillingStatement({ ...input, provider, csvText });
    const { run, rows } = createBillingReconciliationPersistenceRecords(result, {
        actor,
        fileName: input.fileName,
        fileHash,
        note: input.note,
    });
    const created = await withPostgresTransaction(async (client) => {
        return createPostgresRepositories(client).billing.createReconciliationRun(run, rows);
    });
    if (!created) throw new BillingInputError("该支付渠道的同一账单文件已经导入", 409);
    return { ...result, runId: run.id, source: run.source, fileName: run.fileName, importedByUsername: run.importedByUsername };
}

export async function reconcileBillingStatement(input: ReconcileBillingStatementInput): Promise<BillingReconciliationResult> {
    if (!isPostgresDatabaseEnabled()) throw new BillingInputError("支付对账需要启用 PostgreSQL", 501);
    await ensurePostgresSchema();
    const provider = normalizeProvider(input.provider);
    const rows = parsePaymentStatementCsv(normalizeText(input.csvText, "", 200_000), provider);
    const repos = createPostgresRepositories();
    const cache = new Map<string, Promise<LocalBillingReconciliationRecord | undefined>>();
    const records: LocalBillingReconciliationRecord[] = [];
    for (const row of rows) {
        const cacheKey = reconciliationLookupCacheKey(row);
        if (!cache.has(cacheKey)) cache.set(cacheKey, findLocalRecordForStatementRow(row));
        const record = await cache.get(cacheKey);
        if (record) records.push(record);
    }
    return reconcilePaymentStatementRows(provider, rows, records);

    async function findLocalRecordForStatementRow(row: PaymentStatementRow) {
        const order = await findLocalOrder(row);
        if (!order) return undefined;
        const payments = await repos.billing.listPaymentsByOrderId(order.id);
        return { order, payments };
    }

    async function findLocalOrder(row: PaymentStatementRow) {
        if (row.orderNo) {
            const exact = await repos.billing.getOrderByOrderNo(row.orderNo);
            if (exact && localOrderMatchesStatement(exact, row)) return exact;
        }
        const identifiers = statementIdentifiers(row);
        const order = await repos.billing.getOrderByProviderIdentifiers(row.provider, identifiers);
        if (order && localOrderMatchesStatement(order, row)) return order;
        const payment = await repos.billing.getPaymentByProviderIdentifiers(row.provider, identifiers);
        if (payment) return repos.billing.getOrderById(payment.orderId);
        return undefined;
    }
}
