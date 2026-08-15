import type { QueryExecutor } from "@/lib/server/database/postgres";
import type { BillingOrderRecord, BillingOrderStatus, BillingSummaryRecord, PageInput, PageResult } from "./repository-shared";
import { jsonParam, jsonValue, mapBillingOrder, normalizePage, normalizePageSize, numberValue, pageResult, stringValue } from "./repository-shared";

export const BILLING_ORDER_NOTIFY_CHANNEL = "vozeb_pro_billing_order_events";

export class BillingOrderRepository {
    constructor(private readonly db: QueryExecutor) {}

    async createOrder(order: BillingOrderRecord) {
        const result = await this.db.query(
            `
            INSERT INTO billing_orders (
                id, order_no, product_id, user_id, product_kind, plan_id, status, subject, list_amount_cents,
                promotion_discount_cents, coupon_discount_cents, amount_cents, currency, points_amount, daily_points,
                period_days, quantity, provider, provider_order_id, provider_payment_id, promotion_campaign_id,
                user_coupon_id, expires_at, paid_at, closed_at, pricing_snapshot, metadata, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
            RETURNING *
            `,
            [
                order.id,
                order.orderNo,
                order.productId || null,
                order.userId || null,
                order.productKind,
                order.planId || null,
                order.status,
                order.subject,
                order.listAmountCents,
                order.promotionDiscountCents,
                order.couponDiscountCents,
                order.amountCents,
                order.currency,
                order.pointsAmount,
                order.dailyPoints,
                order.periodDays,
                order.quantity,
                order.provider,
                order.providerOrderId || null,
                order.providerPaymentId || null,
                order.promotionCampaignId || null,
                order.userCouponId || null,
                order.expiresAt || null,
                order.paidAt || null,
                order.closedAt || null,
                jsonParam(order.pricingSnapshot ?? {}),
                jsonParam(order.metadata ?? {}),
                order.createdAt,
                order.updatedAt,
            ],
        );
        return mapBillingOrder(result.rows[0]);
    }

    async getOrderById(id: string, forUpdate?: boolean) {
        const result = await this.db.query(`SELECT * FROM billing_orders WHERE id = $1${forUpdate ? " FOR UPDATE" : ""}`, [id]);
        return result.rows[0] ? mapBillingOrder(result.rows[0]) : null;
    }

    async getOrderByOrderNo(orderNo: string) {
        const result = await this.db.query("SELECT * FROM billing_orders WHERE order_no = $1", [orderNo]);
        return result.rows[0] ? mapBillingOrder(result.rows[0]) : null;
    }

    async getOrderByProviderIdentifiers(provider: string, identifiers: string[]) {
        const values = [...new Set(identifiers.map((item) => item.trim()).filter(Boolean))];
        if (!values.length) return null;
        const result = await this.db.query(
            `SELECT * FROM billing_orders
             WHERE provider = $1
               AND (provider_order_id = ANY($2::text[]) OR provider_payment_id = ANY($2::text[]))
             ORDER BY created_at DESC, id DESC
             LIMIT 1`,
            [provider, values],
        );
        return result.rows[0] ? mapBillingOrder(result.rows[0]) : null;
    }

    async listOrders(input: PageInput & { userId?: string; status?: BillingOrderStatus; planId?: string; productId?: string; keyword?: string } = {}): Promise<PageResult<BillingOrderRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const keyword = input.keyword?.trim().toLowerCase() || "";
        const result = await this.db.query(
            `
            SELECT orders.*, users.account_id AS user_account_id, users.username AS user_username,
                   users.display_name AS user_display_name, count(*) OVER() AS total_count
            FROM billing_orders orders
            LEFT JOIN users ON users.id = orders.user_id
            WHERE ($1::text IS NULL OR orders.user_id = $1)
              AND ($2::text IS NULL OR orders.status = $2)
              AND ($3::text IS NULL OR orders.plan_id = $3)
              AND ($4::text IS NULL OR orders.product_id = $4)
              AND ($5 = '' OR lower(orders.order_no) LIKE $6 OR lower(orders.subject) LIKE $6
                   OR lower(coalesce(orders.provider_order_id, '')) LIKE $6 OR lower(coalesce(orders.provider_payment_id, '')) LIKE $6
                   OR lpad(users.account_id::text, 4, '0') LIKE $6 OR lower(coalesce(users.username, '')) LIKE $6 OR lower(coalesce(users.display_name, '')) LIKE $6)
            ORDER BY orders.created_at DESC
            LIMIT $7 OFFSET $8
            `,
            [input.userId || null, input.status || null, input.planId || null, input.productId || null, keyword, `%${keyword}%`, pageSize, (page - 1) * pageSize],
        );
        return pageResult(result.rows.map(mapBillingOrder), Number(result.rows[0]?.total_count || 0), page, pageSize);
    }

    async getSummary(input: { startDate?: string; endDate?: string } = {}): Promise<BillingSummaryRecord> {
        const result = await this.db.query<Record<string, unknown>>(
            `
            WITH scoped_orders AS MATERIALIZED (
                SELECT id, provider, status, amount_cents, promotion_discount_cents, coupon_discount_cents
                FROM billing_orders
                WHERE ($1::timestamptz IS NULL OR created_at >= $1)
                  AND ($2::timestamptz IS NULL OR created_at <= $2)
            ),
            scoped_payments AS MATERIALIZED (
                SELECT order_id, status, amount_cents
                FROM payment_transactions
                WHERE ($1::timestamptz IS NULL OR created_at >= $1)
                  AND ($2::timestamptz IS NULL OR created_at <= $2)
            ),
            order_summary AS (
                SELECT
                    count(*) AS total,
                    count(*) FILTER (WHERE status = 'pending') AS pending,
                    count(*) FILTER (WHERE status = 'paid') AS paid,
                    count(*) FILTER (WHERE status = 'closed') AS closed,
                    count(*) FILTER (WHERE status = 'canceled') AS canceled,
                    count(*) FILTER (WHERE status = 'refunded') AS refunded,
                    count(*) FILTER (WHERE status IN ('paid', 'refunded')) AS converted,
                    count(*) FILTER (WHERE promotion_discount_cents > 0) AS promotion_orders,
                    count(*) FILTER (WHERE promotion_discount_cents > 0 AND status IN ('paid', 'refunded')) AS promotion_converted_orders,
                    coalesce(sum(promotion_discount_cents) FILTER (WHERE status IN ('paid', 'refunded')), 0) AS promotion_discount_cents,
                    count(*) FILTER (WHERE coupon_discount_cents > 0) AS coupon_orders,
                    count(*) FILTER (WHERE coupon_discount_cents > 0 AND status IN ('paid', 'refunded')) AS coupon_converted_orders,
                    coalesce(sum(coupon_discount_cents) FILTER (WHERE status IN ('paid', 'refunded')), 0) AS coupon_discount_cents,
                    coalesce(sum(amount_cents) FILTER (WHERE status IN ('paid', 'refunded')), 0) AS gross_amount_cents,
                    coalesce(sum(amount_cents) FILTER (WHERE status = 'paid'), 0) AS paid_amount_cents,
                    coalesce(sum(amount_cents) FILTER (WHERE status = 'pending'), 0) AS pending_amount_cents,
                    coalesce(sum(amount_cents) FILTER (WHERE status = 'refunded'), 0) AS refunded_amount_cents
                FROM scoped_orders
            ),
            payment_summary AS (
                SELECT
                    count(*) FILTER (WHERE status = 'succeeded') AS succeeded,
                    count(*) FILTER (WHERE status = 'refunded') AS refunded,
                    coalesce(sum(amount_cents) FILTER (WHERE status = 'succeeded'), 0) AS succeeded_amount_cents,
                    coalesce(sum(amount_cents) FILTER (WHERE status = 'refunded'), 0) AS refunded_amount_cents
                FROM scoped_payments
            ),
            provider_summary AS (
                SELECT
                    provider,
                    count(*) AS total_orders,
                    count(*) FILTER (WHERE status = 'pending') AS pending_orders,
                    count(*) FILTER (WHERE status = 'paid') AS paid_orders,
                    count(*) FILTER (WHERE status = 'refunded') AS refunded_orders,
                    coalesce(sum(amount_cents) FILTER (WHERE status = 'paid'), 0) AS paid_amount_cents,
                    coalesce(sum(amount_cents) FILTER (WHERE status = 'refunded'), 0) AS refunded_amount_cents
                FROM scoped_orders
                GROUP BY provider
            ),
            reconciliation_summary AS (
                SELECT
                    (
                        SELECT count(*)
                        FROM scoped_orders order_row
                        WHERE order_row.status = 'paid'
                          AND NOT EXISTS (
                              SELECT 1
                              FROM scoped_payments payment_row
                              WHERE payment_row.order_id = order_row.id AND payment_row.status = 'succeeded'
                          )
                    ) AS paid_orders_without_succeeded_payment,
                    (
                        SELECT count(*)
                        FROM scoped_payments payment_row
                        JOIN scoped_orders order_row ON order_row.id = payment_row.order_id
                        WHERE payment_row.status = 'succeeded' AND order_row.status NOT IN ('paid', 'refunded')
                    ) AS succeeded_payments_without_paid_order,
                    (
                        SELECT count(*)
                        FROM scoped_payments payment_row
                        JOIN scoped_orders order_row ON order_row.id = payment_row.order_id
                        WHERE payment_row.status IN ('succeeded', 'refunded') AND payment_row.amount_cents <> order_row.amount_cents
                    ) AS amount_mismatch_payments
            )
            SELECT
                order_summary.total AS order_total,
                order_summary.pending AS order_pending,
                order_summary.paid AS order_paid,
                order_summary.closed AS order_closed,
                order_summary.canceled AS order_canceled,
                order_summary.refunded AS order_refunded,
                order_summary.gross_amount_cents AS order_gross_amount_cents,
                order_summary.paid_amount_cents AS order_paid_amount_cents,
                order_summary.pending_amount_cents AS order_pending_amount_cents,
                order_summary.refunded_amount_cents AS order_refunded_amount_cents,
                order_summary.converted AS commerce_converted_orders,
                order_summary.promotion_orders AS commerce_promotion_orders,
                order_summary.promotion_converted_orders AS commerce_promotion_converted_orders,
                order_summary.promotion_discount_cents AS commerce_promotion_discount_cents,
                order_summary.coupon_orders AS commerce_coupon_orders,
                order_summary.coupon_converted_orders AS commerce_coupon_converted_orders,
                order_summary.coupon_discount_cents AS commerce_coupon_discount_cents,
                payment_summary.succeeded AS payment_succeeded,
                payment_summary.refunded AS payment_refunded,
                payment_summary.succeeded_amount_cents AS payment_succeeded_amount_cents,
                payment_summary.refunded_amount_cents AS payment_refunded_amount_cents,
                coalesce((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'provider', provider,
                            'totalOrders', total_orders,
                            'pendingOrders', pending_orders,
                            'paidOrders', paid_orders,
                            'refundedOrders', refunded_orders,
                            'paidAmountCents', paid_amount_cents,
                            'refundedAmountCents', refunded_amount_cents
                        )
                        ORDER BY paid_amount_cents DESC, total_orders DESC, provider ASC
                    )
                    FROM provider_summary
                ), '[]'::jsonb) AS providers,
                reconciliation_summary.paid_orders_without_succeeded_payment,
                reconciliation_summary.succeeded_payments_without_paid_order,
                reconciliation_summary.amount_mismatch_payments
            FROM order_summary
            CROSS JOIN payment_summary
            CROSS JOIN reconciliation_summary
            `,
            [input.startDate || null, input.endDate || null],
        );

        const row = result.rows[0] || {};
        const providers = jsonValue(row.providers);
        return {
            orders: {
                total: numberValue(row.order_total),
                pending: numberValue(row.order_pending),
                paid: numberValue(row.order_paid),
                closed: numberValue(row.order_closed),
                canceled: numberValue(row.order_canceled),
                refunded: numberValue(row.order_refunded),
                grossAmountCents: numberValue(row.order_gross_amount_cents),
                paidAmountCents: numberValue(row.order_paid_amount_cents),
                pendingAmountCents: numberValue(row.order_pending_amount_cents),
                refundedAmountCents: numberValue(row.order_refunded_amount_cents),
            },
            payments: {
                succeeded: numberValue(row.payment_succeeded),
                refunded: numberValue(row.payment_refunded),
                succeededAmountCents: numberValue(row.payment_succeeded_amount_cents),
                refundedAmountCents: numberValue(row.payment_refunded_amount_cents),
            },
            commerce: {
                convertedOrders: numberValue(row.commerce_converted_orders),
                promotionOrders: numberValue(row.commerce_promotion_orders),
                promotionConvertedOrders: numberValue(row.commerce_promotion_converted_orders),
                promotionDiscountCents: numberValue(row.commerce_promotion_discount_cents),
                couponOrders: numberValue(row.commerce_coupon_orders),
                couponConvertedOrders: numberValue(row.commerce_coupon_converted_orders),
                couponDiscountCents: numberValue(row.commerce_coupon_discount_cents),
            },
            providers: Array.isArray(providers)
                ? providers.flatMap((item): BillingSummaryRecord["providers"] => {
                      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
                      return [
                          {
                              provider: stringValue(item.provider) || "unknown",
                              totalOrders: numberValue(item.totalOrders),
                              pendingOrders: numberValue(item.pendingOrders),
                              paidOrders: numberValue(item.paidOrders),
                              refundedOrders: numberValue(item.refundedOrders),
                              paidAmountCents: numberValue(item.paidAmountCents),
                              refundedAmountCents: numberValue(item.refundedAmountCents),
                          },
                      ];
                  })
                : [],
            reconciliation: {
                paidOrdersWithoutSucceededPayment: numberValue(row.paid_orders_without_succeeded_payment),
                succeededPaymentsWithoutPaidOrder: numberValue(row.succeeded_payments_without_paid_order),
                amountMismatchPayments: numberValue(row.amount_mismatch_payments),
            },
        };
    }

    async expirePendingOrders(input: { expiredAt: string; limit: number; orderId?: string }) {
        const result = await this.db.query(
            `
            WITH expired AS (
                SELECT id
                FROM billing_orders
                WHERE status = 'pending'
                  AND expires_at IS NOT NULL
                  AND expires_at <= $1
                  AND ($3::text IS NULL OR id = $3)
                ORDER BY expires_at ASC, id ASC
                LIMIT $2
                FOR UPDATE SKIP LOCKED
            ), closed_orders AS (
                UPDATE billing_orders AS orders SET
                    status = 'closed',
                    closed_at = $1,
                    metadata = coalesce(orders.metadata, '{}'::jsonb) || jsonb_build_object(
                        'close',
                        jsonb_build_object(
                            'reason', $4::text,
                            'source', $5::text,
                            'closedAt', $1::text
                        )
                    )
                FROM expired
                WHERE orders.id = expired.id
                  AND orders.status = 'pending'
                RETURNING orders.*
            ), released_coupons AS (
                UPDATE user_coupons AS coupon SET
                    status = CASE WHEN coupon.expires_at <= $1 THEN 'expired' ELSE 'available' END,
                    locked_order_id = NULL,
                    locked_at = NULL
                FROM closed_orders orders
                WHERE coupon.id = orders.user_coupon_id
                  AND coupon.status = 'locked'
                  AND coupon.locked_order_id = orders.id
                RETURNING coupon.id
            )
            SELECT closed_orders.*, pg_notify('${BILLING_ORDER_NOTIFY_CHANNEL}', closed_orders.id) AS notified
            FROM closed_orders
            `,
            [input.expiredAt, input.limit, input.orderId || null, "订单超时自动关闭", "expiration-job"],
        );
        return result.rows.map(mapBillingOrder);
    }

    async updateOrder(id: string, patch: Partial<Omit<BillingOrderRecord, "id" | "orderNo" | "createdAt" | "updatedAt">>) {
        const result = await this.db.query(
            `
            WITH updated_order AS (
            UPDATE billing_orders SET
                product_id = COALESCE($2, product_id),
                user_id = COALESCE($3, user_id),
                product_kind = COALESCE($4, product_kind),
                plan_id = CASE WHEN $5 THEN $6 ELSE plan_id END,
                status = COALESCE($7, status),
                subject = COALESCE($8, subject),
                list_amount_cents = COALESCE($9, list_amount_cents),
                promotion_discount_cents = COALESCE($10, promotion_discount_cents),
                coupon_discount_cents = COALESCE($11, coupon_discount_cents),
                amount_cents = COALESCE($12, amount_cents),
                currency = COALESCE($13, currency),
                points_amount = COALESCE($14, points_amount),
                daily_points = COALESCE($15, daily_points),
                period_days = COALESCE($16, period_days),
                quantity = COALESCE($17, quantity),
                provider = COALESCE($18, provider),
                provider_order_id = COALESCE($19, provider_order_id),
                provider_payment_id = COALESCE($20, provider_payment_id),
                promotion_campaign_id = CASE WHEN $21 THEN $22 ELSE promotion_campaign_id END,
                user_coupon_id = CASE WHEN $23 THEN $24 ELSE user_coupon_id END,
                expires_at = COALESCE($25, expires_at),
                paid_at = COALESCE($26, paid_at),
                closed_at = CASE WHEN $27 THEN $28 ELSE closed_at END,
                pricing_snapshot = COALESCE($29::jsonb, pricing_snapshot),
                metadata = COALESCE($30::jsonb, metadata)
            WHERE id = $1
            RETURNING *
            )
            SELECT updated_order.*,
                   CASE WHEN $7::text IS NOT NULL THEN pg_notify('${BILLING_ORDER_NOTIFY_CHANNEL}', updated_order.id) END AS notified
            FROM updated_order
            `,
            [
                id,
                patch.productId,
                patch.userId,
                patch.productKind,
                Object.prototype.hasOwnProperty.call(patch, "planId"),
                patch.planId || null,
                patch.status,
                patch.subject,
                patch.listAmountCents,
                patch.promotionDiscountCents,
                patch.couponDiscountCents,
                patch.amountCents,
                patch.currency,
                patch.pointsAmount,
                patch.dailyPoints,
                patch.periodDays,
                patch.quantity,
                patch.provider,
                patch.providerOrderId,
                patch.providerPaymentId,
                Object.prototype.hasOwnProperty.call(patch, "promotionCampaignId"),
                patch.promotionCampaignId || null,
                Object.prototype.hasOwnProperty.call(patch, "userCouponId"),
                patch.userCouponId || null,
                patch.expiresAt,
                patch.paidAt,
                Object.prototype.hasOwnProperty.call(patch, "closedAt"),
                patch.closedAt || null,
                jsonParam(patch.pricingSnapshot),
                jsonParam(patch.metadata),
            ],
        );
        return result.rows[0] ? mapBillingOrder(result.rows[0]) : null;
    }
}
