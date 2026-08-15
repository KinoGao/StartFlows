import type {
    BillingOrderStatus,
    BillingProductKind,
    BillingReconciliationRunStatus,
    BillingReconciliationSource,
    BillingReconciliationStatementStatus,
    JsonValue,
    PageResult,
    PaymentTransactionStatus,
    PlanAssignmentSource,
    PlanAssignmentStatus,
} from "./repository-types";

export function jsonParam(value: JsonValue | undefined) {
    return value === undefined ? null : JSON.stringify(value);
}

export function jsonValue(value: unknown): JsonValue {
    if (value === null || value === undefined) return {};
    return value as JsonValue;
}

export function optionalJson(value: unknown): JsonValue | undefined {
    if (value === null || value === undefined) return undefined;
    return value as JsonValue;
}

export function stringValue(value: unknown) {
    return typeof value === "string" ? value : value === null || value === undefined ? "" : String(value);
}

export function optionalString(value: unknown) {
    const text = stringValue(value);
    return text || undefined;
}

export function numberValue(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
}

export function optionalNumber(value: unknown) {
    if (value === null || value === undefined) return undefined;
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
}

export function isoValue(value: unknown) {
    const date = value instanceof Date ? value : new Date(stringValue(value));
    return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

export function optionalIso(value: unknown) {
    if (!value) return undefined;
    return isoValue(value);
}

export function normalizePage(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 1;
}

export function normalizePageSize(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.min(100, Math.floor(number)) : 20;
}

export function pageResult<T>(items: T[], total: number, page: number, pageSize: number): PageResult<T> {
    return { items, total, page, pageSize };
}

export function billingOrderStatusValue(value: unknown): BillingOrderStatus {
    return value === "paid" || value === "closed" || value === "canceled" || value === "refunding" || value === "refunded" ? value : "pending";
}

export function billingProductKindValue(value: unknown): BillingProductKind {
    return value === "points" ? "points" : "plan";
}

export function paymentTransactionStatusValue(value: unknown): PaymentTransactionStatus {
    return value === "succeeded" || value === "failed" || value === "refunded" ? value : "pending";
}

export function billingReconciliationRunStatusValue(value: unknown): BillingReconciliationRunStatus {
    return value === "failed" ? "failed" : "completed";
}

export function billingReconciliationSourceValue(value: unknown): BillingReconciliationSource {
    return value === "provider-api" || value === "manual" ? value : "csv";
}

export function billingReconciliationStatementStatusValue(value: unknown): BillingReconciliationStatementStatus {
    return value === "paid" || value === "refunded" || value === "pending" || value === "failed" ? value : "unknown";
}

export function planAssignmentStatusValue(value: unknown): PlanAssignmentStatus {
    return value === "expired" || value === "canceled" ? value : "active";
}

export function planAssignmentSourceValue(value: unknown): PlanAssignmentSource {
    return value === "order" || value === "cdk" || value === "system" ? value : "admin";
}
