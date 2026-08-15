import { describe, expect, it, vi } from "vitest";

import type { QueryExecutor } from "./postgres";
import { BillingOrderRepository } from "./billing-order-repository";

describe("BillingOrderRepository.listOrders", () => {
    it("searches orders by padded public account id", async () => {
        const query = vi.fn(async (..._args: unknown[]) => ({ rows: [] }));
        const repository = new BillingOrderRepository({ query } as unknown as QueryExecutor);

        await repository.listOrders({ keyword: "0001", page: 1, pageSize: 20 });

        expect(String(query.mock.calls[0]?.[0])).toContain("lpad(users.account_id::text, 4, '0') LIKE $6");
        expect(query.mock.calls[0]?.[1]).toEqual([null, null, null, null, "0001", "%0001%", 20, 0]);
    });
});

describe("BillingOrderRepository.getOrderByProviderIdentifiers", () => {
    it("looks up an order by exact provider identifiers without a paginated search", async () => {
        const query = vi.fn(async (..._args: unknown[]) => ({ rows: [] }));
        const repository = new BillingOrderRepository({ query } as unknown as QueryExecutor);

        await repository.getOrderByProviderIdentifiers("stripe", ["pi_one", "ch_one", "pi_one", ""]);

        const [sql, params] = query.mock.calls[0] || [];
        expect(String(sql)).toContain("provider = $1");
        expect(String(sql)).toContain("provider_order_id = ANY($2::text[])");
        expect(String(sql)).toContain("provider_payment_id = ANY($2::text[])");
        expect(String(sql)).toContain("ORDER BY created_at DESC, id DESC");
        expect(String(sql)).toContain("LIMIT 1");
        expect(params).toEqual(["stripe", ["pi_one", "ch_one"]]);
    });

    it("does not query when no provider identifier is available", async () => {
        const query = vi.fn(async (..._args: unknown[]) => ({ rows: [] }));
        const repository = new BillingOrderRepository({ query } as unknown as QueryExecutor);

        await expect(repository.getOrderByProviderIdentifiers("stripe", ["", " "])).resolves.toBeNull();
        expect(query).not.toHaveBeenCalled();
    });
});

describe("BillingOrderRepository.getSummary", () => {
    it("returns the financial summary with one bounded aggregate query", async () => {
        const query = vi.fn(async (..._args: unknown[]) => ({
            rows: [
                {
                    order_total: "12",
                    order_pending: "2",
                    order_paid: "7",
                    order_closed: "1",
                    order_canceled: "1",
                    order_refunded: "1",
                    order_gross_amount_cents: "20800",
                    order_paid_amount_cents: "18800",
                    order_pending_amount_cents: "1200",
                    order_refunded_amount_cents: "2000",
                    commerce_converted_orders: "8",
                    commerce_promotion_orders: "6",
                    commerce_promotion_converted_orders: "5",
                    commerce_promotion_discount_cents: "1600",
                    commerce_coupon_orders: "4",
                    commerce_coupon_converted_orders: "3",
                    commerce_coupon_discount_cents: "900",
                    payment_succeeded: "7",
                    payment_refunded: "1",
                    payment_succeeded_amount_cents: "18800",
                    payment_refunded_amount_cents: "2000",
                    providers: [
                        {
                            provider: "wechat",
                            totalOrders: 8,
                            pendingOrders: 1,
                            paidOrders: 5,
                            refundedOrders: 1,
                            paidAmountCents: 13800,
                            refundedAmountCents: 2000,
                        },
                    ],
                    paid_orders_without_succeeded_payment: "1",
                    succeeded_payments_without_paid_order: "2",
                    amount_mismatch_payments: "3",
                },
            ],
            rowCount: 1,
        }));
        const repository = new BillingOrderRepository({ query } as unknown as QueryExecutor);

        const summary = await repository.getSummary({ startDate: "2026-07-01T00:00:00.000Z", endDate: "2026-08-01T00:00:00.000Z" });

        expect(summary).toEqual({
            orders: {
                total: 12,
                pending: 2,
                paid: 7,
                closed: 1,
                canceled: 1,
                refunded: 1,
                grossAmountCents: 20800,
                paidAmountCents: 18800,
                pendingAmountCents: 1200,
                refundedAmountCents: 2000,
            },
            payments: {
                succeeded: 7,
                refunded: 1,
                succeededAmountCents: 18800,
                refundedAmountCents: 2000,
            },
            commerce: {
                convertedOrders: 8,
                promotionOrders: 6,
                promotionConvertedOrders: 5,
                promotionDiscountCents: 1600,
                couponOrders: 4,
                couponConvertedOrders: 3,
                couponDiscountCents: 900,
            },
            providers: [
                {
                    provider: "wechat",
                    totalOrders: 8,
                    pendingOrders: 1,
                    paidOrders: 5,
                    refundedOrders: 1,
                    paidAmountCents: 13800,
                    refundedAmountCents: 2000,
                },
            ],
            reconciliation: {
                paidOrdersWithoutSucceededPayment: 1,
                succeededPaymentsWithoutPaidOrder: 2,
                amountMismatchPayments: 3,
            },
        });
        expect(query).toHaveBeenCalledTimes(1);
        const [sql, rawParams] = query.mock.calls[0] || [];
        const params = rawParams as unknown[] | undefined;
        expect(String(sql)).toContain("WITH scoped_orders AS MATERIALIZED");
        expect(String(sql)).toContain("promotion_discount_cents > 0 AND status IN ('paid', 'refunded')");
        expect(String(sql)).toContain("coupon_discount_cents > 0 AND status IN ('paid', 'refunded')");
        expect(String(sql)).toContain("scoped_payments AS MATERIALIZED");
        expect(String(sql)).toContain("order_row.status NOT IN ('paid', 'refunded')");
        expect(String(sql).match(/FROM payment_transactions/g)).toHaveLength(1);
        expect(String(sql).match(/FROM scoped_payments/g)).toHaveLength(4);
        expect(String(sql)).not.toMatch(/SELECT\s+\*/i);
        expect(params).toEqual(["2026-07-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z"]);
    });
});

describe("BillingOrderRepository.expirePendingOrders", () => {
    it("closes a locked batch and releases only coupons owned by those orders", async () => {
        const query = vi.fn(async (..._args: unknown[]) => ({ rows: [] }));
        const repository = new BillingOrderRepository({ query } as unknown as QueryExecutor);

        await repository.expirePendingOrders({ expiredAt: "2026-07-26T00:00:00.000Z", limit: 100 });

        const [sql, params] = query.mock.calls[0] || [];
        expect(String(sql)).toContain("FOR UPDATE SKIP LOCKED");
        expect(String(sql)).toContain("released_coupons AS");
        expect(String(sql)).toContain("coupon.locked_order_id = orders.id");
        expect(String(sql)).toContain("CASE WHEN coupon.expires_at <= $1 THEN 'expired' ELSE 'available' END");
        expect(String(sql)).toContain("pg_notify('vozeb_pro_billing_order_events', closed_orders.id)");
        expect(params).toEqual(["2026-07-26T00:00:00.000Z", 100, null, "订单超时自动关闭", "expiration-job"]);
    });
});

describe("BillingOrderRepository.updateOrder", () => {
    it("notifies subscribers when an order status changes", async () => {
        const query = vi.fn(async (..._args: unknown[]) => ({ rows: [] }));
        const repository = new BillingOrderRepository({ query } as unknown as QueryExecutor);

        await repository.updateOrder("order-one", { status: "paid" });

        const [sql, rawParams] = query.mock.calls[0] || [];
        const params = rawParams as unknown[] | undefined;
        expect(String(sql)).toContain("WITH updated_order AS");
        expect(String(sql)).toContain("CASE WHEN $7::text IS NOT NULL THEN pg_notify('vozeb_pro_billing_order_events', updated_order.id)");
        expect(params?.[0]).toBe("order-one");
        expect(params?.[6]).toBe("paid");
    });
});
