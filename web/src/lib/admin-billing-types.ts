export type AdminBillingSummary = {
    orders: {
        total: number;
        pending: number;
        paid: number;
        closed: number;
        canceled: number;
        refunded: number;
        grossAmountCents: number;
        paidAmountCents: number;
        pendingAmountCents: number;
        refundedAmountCents: number;
    };
    payments: {
        succeeded: number;
        refunded: number;
        succeededAmountCents: number;
        refundedAmountCents: number;
    };
    commerce: {
        convertedOrders: number;
        promotionOrders: number;
        promotionConvertedOrders: number;
        promotionDiscountCents: number;
        couponOrders: number;
        couponConvertedOrders: number;
        couponDiscountCents: number;
    };
    providers: Array<{
        provider: string;
        totalOrders: number;
        pendingOrders: number;
        paidOrders: number;
        refundedOrders: number;
        paidAmountCents: number;
        refundedAmountCents: number;
    }>;
    reconciliation: {
        paidOrdersWithoutSucceededPayment: number;
        succeededPaymentsWithoutPaidOrder: number;
        amountMismatchPayments: number;
    };
};

export type BillingStatementStatus = "paid" | "refunded" | "pending" | "failed" | "unknown";
export type BillingReconciliationSource = "csv" | "provider-api" | "manual";

export type BillingReconciliationIssueCode =
    "invalid_statement_row" | "duplicate_statement_record" | "identifier_mismatch" | "missing_local_order" | "missing_local_payment" | "provider_mismatch" | "amount_mismatch" | "currency_mismatch" | "status_mismatch";

export type BillingReconciliationIssue = {
    code: BillingReconciliationIssueCode;
    severity: "error" | "warning";
    message: string;
    statementValue?: string;
    localValue?: string;
};

export type BillingReconciliationRow = {
    rowNumber: number;
    key: string;
    provider: string;
    orderNo?: string;
    providerOrderId?: string;
    providerPaymentId?: string;
    statementStatus: BillingStatementStatus;
    amountCents?: number;
    currency?: string;
    localOrderId?: string;
    localOrderNo?: string;
    localOrderStatus?: string;
    localAmountCents?: number;
    localCurrency?: string;
    issueCodes: BillingReconciliationIssueCode[];
    issues: BillingReconciliationIssue[];
};

export type BillingReconciliationResult = {
    runId?: string;
    provider: string;
    source?: BillingReconciliationSource;
    fileName?: string;
    importedByUsername?: string;
    totalRows: number;
    matchedRows: number;
    okRows: number;
    issueRows: number;
    totals: {
        statementPaidAmountCents: number;
        statementRefundedAmountCents: number;
        localMatchedAmountCents: number;
        differenceAmountCents: number;
    };
    rows: BillingReconciliationRow[];
    generatedAt: string;
};

export type BillingReconciliationRun = {
    id: string;
    provider: string;
    source: BillingReconciliationSource;
    status: "completed" | "failed";
    totalRows: number;
    matchedRows: number;
    okRows: number;
    issueRows: number;
    statementPaidAmountCents: number;
    statementRefundedAmountCents: number;
    localMatchedAmountCents: number;
    differenceAmountCents: number;
    importedByUserId?: string;
    importedByUsername?: string;
    fileName?: string;
    note?: string;
    createdAt: string;
    updatedAt: string;
};
