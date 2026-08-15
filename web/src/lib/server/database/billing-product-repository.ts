import type { QueryExecutor } from "@/lib/server/database/postgres";
import type { BillingProductRecord } from "./repository-shared";
import { jsonParam, mapBillingProduct } from "./repository-shared";

export class BillingProductRepository {
    constructor(private readonly db: QueryExecutor) {}

    async listProducts(includeDisabled = false) {
        const result = await this.db.query("SELECT * FROM billing_products WHERE ($1::boolean = true OR enabled = true) ORDER BY sort_order ASC, created_at DESC", [includeDisabled]);
        return result.rows.map(mapBillingProduct);
    }

    async getProductById(id: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM billing_products WHERE id = $1${forUpdate ? " FOR UPDATE" : ""}`, [id]);
        return result.rows[0] ? mapBillingProduct(result.rows[0]) : null;
    }

    async getProductsByIds(ids: string[], forUpdate = false) {
        if (!ids.length) return [];
        const result = await this.db.query(`SELECT * FROM billing_products WHERE id = ANY($1::text[]) ORDER BY id ASC${forUpdate ? " FOR UPDATE" : ""}`, [ids]);
        return result.rows.map(mapBillingProduct);
    }

    async upsertProduct(product: BillingProductRecord) {
        const result = await this.db.query(
            `
            INSERT INTO billing_products (
                id, product_kind, plan_id, name, description, amount_cents, currency, points_amount,
                daily_points, period_days, enabled, sort_order, metadata, created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (id) DO UPDATE SET
                product_kind = EXCLUDED.product_kind,
                plan_id = EXCLUDED.plan_id,
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                amount_cents = EXCLUDED.amount_cents,
                currency = EXCLUDED.currency,
                points_amount = EXCLUDED.points_amount,
                daily_points = EXCLUDED.daily_points,
                period_days = EXCLUDED.period_days,
                enabled = EXCLUDED.enabled,
                sort_order = EXCLUDED.sort_order,
                metadata = EXCLUDED.metadata
            RETURNING *
            `,
            [
                product.id,
                product.productKind,
                product.planId || null,
                product.name,
                product.description,
                product.amountCents,
                product.currency,
                product.pointsAmount,
                product.dailyPoints,
                product.periodDays,
                product.enabled,
                product.sortOrder,
                jsonParam(product.metadata ?? {}),
                product.createdAt,
                product.updatedAt,
            ],
        );
        return mapBillingProduct(result.rows[0]);
    }

    async updateProduct(id: string, patch: Partial<Omit<BillingProductRecord, "id" | "createdAt" | "updatedAt">>) {
        const result = await this.db.query(
            `
            UPDATE billing_products SET
                product_kind = COALESCE($2, product_kind),
                plan_id = CASE WHEN $3 THEN $4 ELSE plan_id END,
                name = COALESCE($5, name),
                description = COALESCE($6, description),
                amount_cents = COALESCE($7, amount_cents),
                currency = COALESCE($8, currency),
                points_amount = COALESCE($9, points_amount),
                daily_points = COALESCE($10, daily_points),
                period_days = COALESCE($11, period_days),
                enabled = COALESCE($12, enabled),
                sort_order = COALESCE($13, sort_order),
                metadata = COALESCE($14::jsonb, metadata)
            WHERE id = $1
            RETURNING *
            `,
            [
                id,
                patch.productKind,
                Object.prototype.hasOwnProperty.call(patch, "planId"),
                patch.planId || null,
                patch.name,
                patch.description,
                patch.amountCents,
                patch.currency,
                patch.pointsAmount,
                patch.dailyPoints,
                patch.periodDays,
                patch.enabled,
                patch.sortOrder,
                jsonParam(patch.metadata),
            ],
        );
        return result.rows[0] ? mapBillingProduct(result.rows[0]) : null;
    }

    async deleteProductIfUnused(id: string) {
        const result = await this.db.query(
            `DELETE FROM billing_products
             WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM billing_orders WHERE product_id = $1)
             RETURNING *`,
            [id],
        );
        return result.rows[0] ? mapBillingProduct(result.rows[0]) : null;
    }
}
