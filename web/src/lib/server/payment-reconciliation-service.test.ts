import { describe, expect, it } from "vitest";

import type { BillingOrderRecord, PaymentTransactionRecord } from "@/lib/server/database";
import { createBillingReconciliationPersistenceRecords, parsePaymentStatementCsv, reconcilePaymentStatementRows, type LocalBillingReconciliationRecord } from "./payment-reconciliation-service";

const baseOrder = {
    id: "order-one",
    orderNo: "VZ001",
    productId: "product",
    userId: "user",
    productKind: "plan",
    planId: "pro",
    status: "paid",
    subject: "Pro",
    listAmountCents: 1990,
    promotionDiscountCents: 0,
    couponDiscountCents: 0,
    amountCents: 1990,
    currency: "CNY",
    pointsAmount: 100,
    dailyPoints: 20,
    periodDays: 30,
    quantity: 1,
    provider: "stripe",
    providerOrderId: "pi_local",
    providerPaymentId: "ch_local",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
} satisfies BillingOrderRecord;

const basePayment = {
    id: "payment-one",
    orderId: baseOrder.id,
    userId: baseOrder.userId,
    provider: "stripe",
    channel: "checkout",
    status: "succeeded",
    amountCents: baseOrder.amountCents,
    currency: baseOrder.currency,
    providerTradeId: "pi_local",
    providerPaymentId: "ch_local",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
} satisfies PaymentTransactionRecord;

function local(order: BillingOrderRecord, payments: PaymentTransactionRecord[] = [basePayment]): LocalBillingReconciliationRecord {
    return { order, payments };
}

describe("payment statement reconciliation", () => {
    it("parses Chinese CSV headers, quoted commas, yuan amounts, and provider statuses", () => {
        const rows = parsePaymentStatementCsv('商户订单号,支付流水号,金额,币种,状态,备注\nVZ001,ch_local,19.90,CNY,TRADE_SUCCESS,"套餐,月卡"\nVZ002,ch_refund,12.50,CNY,REFUNDED,"售后,退款"', "stripe");

        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            rowNumber: 2,
            provider: "stripe",
            orderNo: "VZ001",
            providerPaymentId: "ch_local",
            amountCents: 1990,
            currency: "CNY",
            status: "paid",
        });
        expect(rows[1]?.status).toBe("refunded");
    });

    it("matches successful statement rows to local paid orders and payments", () => {
        const rows = parsePaymentStatementCsv("order_no,payment_id,amount,currency,status\nVZ001,ch_local,19.90,CNY,succeeded", "stripe");
        const result = reconcilePaymentStatementRows("stripe", rows, [local(baseOrder)]);

        expect(result).toMatchObject({ totalRows: 1, matchedRows: 1, okRows: 1, issueRows: 0 });
        expect(result.rows[0]?.issueCodes).toEqual([]);
        expect(result.totals.statementPaidAmountCents).toBe(1990);
    });

    it("reports missing local order and duplicate statement records", () => {
        const rows = parsePaymentStatementCsv("order_no,payment_id,amount,currency,status\nVZ404,ch_missing,19.90,CNY,succeeded\nVZ404,ch_missing,19.90,CNY,succeeded", "stripe");
        const result = reconcilePaymentStatementRows("stripe", rows, [local(baseOrder)]);

        expect(result.issueRows).toBe(2);
        expect(result.rows[0]?.issueCodes).toContain("missing_local_order");
        expect(result.rows[1]?.issueCodes).toEqual(expect.arrayContaining(["duplicate_statement_record", "missing_local_order"]));
    });

    it("does not mark rows without identifiers as duplicates", () => {
        const rows = parsePaymentStatementCsv("amount,currency,status\n19.90,CNY,succeeded\n19.90,CNY,succeeded", "stripe");
        const result = reconcilePaymentStatementRows("stripe", rows, []);

        expect(result.rows[0]?.issueCodes).toEqual(expect.arrayContaining(["invalid_statement_row", "missing_local_order"]));
        expect(result.rows[1]?.issueCodes).toEqual(expect.arrayContaining(["invalid_statement_row", "missing_local_order"]));
        expect(result.rows[1]?.issueCodes).not.toContain("duplicate_statement_record");
    });

    it("matches by later statement identifiers and reports mismatched order numbers", () => {
        const rows = parsePaymentStatementCsv("order_no,payment_id,amount,currency,status\nVZ-WRONG,ch_local,19.90,CNY,succeeded", "stripe");
        const result = reconcilePaymentStatementRows("stripe", rows, [local(baseOrder)]);

        expect(result.rows[0]?.localOrderId).toBe(baseOrder.id);
        expect(result.rows[0]?.issueCodes).toContain("identifier_mismatch");
        expect(result.rows[0]?.issueCodes).not.toContain("missing_local_order");
    });

    it("compares paid and refunded statement totals as a net amount", () => {
        const refundedOrder = { ...baseOrder, status: "refunded" } satisfies BillingOrderRecord;
        const refundPayment = { ...basePayment, id: "payment-refund", status: "refunded", providerPaymentId: "ch_refund" } satisfies PaymentTransactionRecord;
        const rows = parsePaymentStatementCsv("order_no,payment_id,amount,currency,status\nVZ001,ch_local,19.90,CNY,succeeded\nVZ001,ch_refund,(19.90),CNY,refunded", "stripe");
        const result = reconcilePaymentStatementRows("stripe", rows, [local(refundedOrder, [basePayment, refundPayment])]);

        expect(result.totals.statementPaidAmountCents).toBe(1990);
        expect(result.totals.statementRefundedAmountCents).toBe(1990);
        expect(result.totals.localMatchedAmountCents).toBe(0);
        expect(result.totals.differenceAmountCents).toBe(0);
    });

    it("creates normalized persistence records without storing the raw CSV payload", () => {
        const rows = parsePaymentStatementCsv("order_no,payment_id,amount,currency,status,备注\nVZ404,ch_missing,19.90,CNY,succeeded,不要保存整份原始账单", "stripe");
        const result = reconcilePaymentStatementRows("stripe", rows, [local(baseOrder)]);
        const records = createBillingReconciliationPersistenceRecords(result, {
            actor: { userId: "admin-one", username: "owner" },
            fileName: "stripe-statement.csv",
        });

        expect(records.run).toMatchObject({
            provider: "stripe",
            source: "csv",
            status: "completed",
            totalRows: 1,
            issueRows: 1,
            importedByUserId: "admin-one",
            importedByUsername: "owner",
            fileName: "stripe-statement.csv",
        });
        expect(records.rows).toHaveLength(1);
        expect(records.rows[0]).toMatchObject({
            runId: records.run.id,
            rowNumber: 2,
            orderNo: "VZ404",
            providerPaymentId: "ch_missing",
            statementStatus: "paid",
        });
        expect(JSON.stringify(records)).not.toContain("不要保存整份原始账单");
    });

    it("reports missing payment, amount mismatch, currency mismatch, and status mismatch", () => {
        const rows = parsePaymentStatementCsv("order_no,payment_id,amount,currency,status\nVZ001,ch_local,20.00,USD,refunded", "stripe");
        const result = reconcilePaymentStatementRows("stripe", rows, [local(baseOrder, [])]);

        expect(result.rows[0]?.issueCodes).toEqual(expect.arrayContaining(["missing_local_payment", "amount_mismatch", "currency_mismatch", "status_mismatch"]));
    });
});
