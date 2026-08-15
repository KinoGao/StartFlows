import type { QueryExecutor } from "@/lib/server/database/postgres";
import type { CouponRedemptionRecord, CouponTemplateRecord, PageInput, PageResult, UserCouponListItemRecord, UserCouponRecord } from "./repository-shared";
import { jsonParam, mapCouponRedemption, mapCouponTemplate, mapUserCoupon, normalizePage, normalizePageSize, pageResult } from "./repository-shared";

export class CouponRepository {
    constructor(private readonly db: QueryExecutor) {}

    async listTemplates(input: PageInput & { includeDisabled?: boolean; claimableOnly?: boolean; at?: string; userId?: string; keyword?: string; selectedId?: string } = {}): Promise<PageResult<CouponTemplateRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const keyword = input.keyword?.trim().slice(0, 80);
        const keywordPattern = keyword ? `%${keyword.replace(/[\\%_]/g, "\\$&")}%` : null;
        const result = await this.db.query(
            `
            SELECT template.*, count(*) OVER() AS total_count,
                coalesce((SELECT jsonb_agg(product.product_id ORDER BY product.product_id) FROM coupon_template_products product WHERE product.template_id = template.id), '[]'::jsonb) AS product_ids
            FROM coupon_templates template
            WHERE ($1::boolean = true OR template.enabled = true OR template.id = $7)
              AND ($2::boolean = false OR template.claimable = true)
              AND ($2::boolean = false OR template.total_limit = 0 OR template.issued_count < template.total_limit)
              AND ($3::timestamptz IS NULL OR (template.starts_at <= $3 AND template.ends_at > $3))
              AND (
                  $4::text IS NULL OR
                  (SELECT count(*) FROM user_coupons coupon WHERE coupon.template_id = template.id AND coupon.user_id = $4) < template.per_user_limit
              )
              AND ($8::text IS NULL OR template.id = $7 OR template.name ILIKE $8 ESCAPE '\\' OR template.code ILIKE $8 ESCAPE '\\')
            ORDER BY CASE WHEN template.id = $7 THEN 0 ELSE 1 END, template.created_at DESC
            LIMIT $5 OFFSET $6
            `,
            [input.includeDisabled === true, input.claimableOnly === true, input.at || null, input.userId || null, pageSize, (page - 1) * pageSize, input.selectedId || null, keywordPattern],
        );
        return pageResult(result.rows.map(mapCouponTemplate), Number(result.rows[0]?.total_count || 0), page, pageSize);
    }

    async getTemplateById(id: string, forUpdate = false) {
        return this.getTemplate("template.id = $1", id, forUpdate);
    }

    async getTemplateByCode(code: string, forUpdate = false) {
        return this.getTemplate("upper(template.code) = upper($1)", code, forUpdate);
    }

    private async getTemplate(where: string, value: string, forUpdate: boolean) {
        const result = await this.db.query(
            `
            SELECT template.*,
                coalesce((SELECT jsonb_agg(product.product_id ORDER BY product.product_id) FROM coupon_template_products product WHERE product.template_id = template.id), '[]'::jsonb) AS product_ids
            FROM coupon_templates template
            WHERE ${where}
            ${forUpdate ? "FOR UPDATE OF template" : ""}
            `,
            [value],
        );
        return result.rows[0] ? mapCouponTemplate(result.rows[0]) : null;
    }

    async upsertTemplate(template: Omit<CouponTemplateRecord, "productIds">) {
        const result = await this.db.query(
            `
            INSERT INTO coupon_templates (
                id, code, name, description, discount_type, discount_value, minimum_amount_cents,
                maximum_discount_cents, stack_with_promotion, claimable, enabled, starts_at, ends_at,
                total_limit, per_user_limit, issued_count, redeemed_count, created_by_user_id, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
            ON CONFLICT (id) DO UPDATE SET
                code = EXCLUDED.code,
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                discount_type = EXCLUDED.discount_type,
                discount_value = EXCLUDED.discount_value,
                minimum_amount_cents = EXCLUDED.minimum_amount_cents,
                maximum_discount_cents = EXCLUDED.maximum_discount_cents,
                stack_with_promotion = EXCLUDED.stack_with_promotion,
                claimable = EXCLUDED.claimable,
                enabled = EXCLUDED.enabled,
                starts_at = EXCLUDED.starts_at,
                ends_at = EXCLUDED.ends_at,
                total_limit = EXCLUDED.total_limit,
                per_user_limit = EXCLUDED.per_user_limit,
                created_by_user_id = coalesce(coupon_templates.created_by_user_id, EXCLUDED.created_by_user_id)
            RETURNING *, '[]'::jsonb AS product_ids
            `,
            [
                template.id,
                template.code,
                template.name,
                template.description,
                template.discountType,
                template.discountValue,
                template.minimumAmountCents,
                template.maximumDiscountCents,
                template.stackWithPromotion,
                template.claimable,
                template.enabled,
                template.startsAt,
                template.endsAt,
                template.totalLimit,
                template.perUserLimit,
                template.issuedCount,
                template.redeemedCount,
                template.createdByUserId || null,
                template.createdAt,
                template.updatedAt,
            ],
        );
        return mapCouponTemplate(result.rows[0]);
    }

    async replaceTemplateProducts(templateId: string, productIds: string[]) {
        await this.db.query("DELETE FROM coupon_template_products WHERE template_id = $1", [templateId]);
        if (!productIds.length) return;
        await this.db.query("INSERT INTO coupon_template_products (template_id, product_id) SELECT $1, unnest($2::text[])", [templateId, productIds]);
    }

    async countUserCoupons(templateId: string, userId: string) {
        const result = await this.db.query("SELECT count(*) AS total FROM user_coupons WHERE template_id = $1 AND user_id = $2", [templateId, userId]);
        return Number(result.rows[0]?.total || 0);
    }

    async createUserCoupon(coupon: UserCouponRecord) {
        const result = await this.db.query(
            `
            INSERT INTO user_coupons (
                id, template_id, user_id, status, grant_source, claimed_at, expires_at, locked_order_id,
                locked_at, redeemed_order_id, redeemed_at, revoked_at, created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING *
            `,
            [
                coupon.id,
                coupon.templateId,
                coupon.userId,
                coupon.status,
                coupon.grantSource,
                coupon.claimedAt,
                coupon.expiresAt,
                coupon.lockedOrderId || null,
                coupon.lockedAt || null,
                coupon.redeemedOrderId || null,
                coupon.redeemedAt || null,
                coupon.revokedAt || null,
                coupon.createdAt,
                coupon.updatedAt,
            ],
        );
        return mapUserCoupon(result.rows[0]);
    }

    async incrementTemplateIssuedCount(id: string) {
        const result = await this.db.query("UPDATE coupon_templates SET issued_count = issued_count + 1 WHERE id = $1 RETURNING *, '[]'::jsonb AS product_ids", [id]);
        return result.rows[0] ? mapCouponTemplate(result.rows[0]) : null;
    }

    async incrementTemplateRedeemedCount(id: string) {
        const result = await this.db.query("UPDATE coupon_templates SET redeemed_count = redeemed_count + 1 WHERE id = $1 RETURNING *, '[]'::jsonb AS product_ids", [id]);
        return result.rows[0] ? mapCouponTemplate(result.rows[0]) : null;
    }

    async listUserCoupons(userId: string, input: PageInput & { status?: UserCouponRecord["status"] } = {}): Promise<PageResult<UserCouponListItemRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const result = await this.db.query(
            `
            SELECT coupon.*, count(*) OVER() AS total_count, to_jsonb(template.*) AS template_row,
                coalesce((SELECT jsonb_agg(product.product_id ORDER BY product.product_id) FROM coupon_template_products product WHERE product.template_id = template.id), '[]'::jsonb) AS template_product_ids
            FROM user_coupons coupon
            JOIN coupon_templates template ON template.id = coupon.template_id
            WHERE coupon.user_id = $1 AND ($2::text IS NULL OR coupon.status = $2)
            ORDER BY coupon.created_at DESC
            LIMIT $3 OFFSET $4
            `,
            [userId, input.status || null, pageSize, (page - 1) * pageSize],
        );
        const items = result.rows.map((row) => {
            const templateRow = row.template_row && typeof row.template_row === "object" && !Array.isArray(row.template_row) ? (row.template_row as Record<string, unknown>) : {};
            return { ...mapUserCoupon(row), template: mapCouponTemplate({ ...templateRow, product_ids: row.template_product_ids }) };
        });
        return pageResult(items, Number(result.rows[0]?.total_count || 0), page, pageSize);
    }

    async getUserCouponById(id: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM user_coupons WHERE id = $1${forUpdate ? " FOR UPDATE" : ""}`, [id]);
        return result.rows[0] ? mapUserCoupon(result.rows[0]) : null;
    }

    async updateUserCoupon(id: string, patch: Partial<Omit<UserCouponRecord, "id" | "templateId" | "userId" | "claimedAt" | "createdAt" | "updatedAt">>) {
        const has = (key: keyof typeof patch) => Object.prototype.hasOwnProperty.call(patch, key);
        const result = await this.db.query(
            `
            UPDATE user_coupons SET
                status = COALESCE($2, status),
                grant_source = COALESCE($3, grant_source),
                expires_at = COALESCE($4, expires_at),
                locked_order_id = CASE WHEN $5 THEN $6 ELSE locked_order_id END,
                locked_at = CASE WHEN $7 THEN $8 ELSE locked_at END,
                redeemed_order_id = CASE WHEN $9 THEN $10 ELSE redeemed_order_id END,
                redeemed_at = CASE WHEN $11 THEN $12 ELSE redeemed_at END,
                revoked_at = CASE WHEN $13 THEN $14 ELSE revoked_at END
            WHERE id = $1
            RETURNING *
            `,
            [
                id,
                patch.status,
                patch.grantSource,
                patch.expiresAt,
                has("lockedOrderId"),
                patch.lockedOrderId || null,
                has("lockedAt"),
                patch.lockedAt || null,
                has("redeemedOrderId"),
                patch.redeemedOrderId || null,
                has("redeemedAt"),
                patch.redeemedAt || null,
                has("revokedAt"),
                patch.revokedAt || null,
            ],
        );
        return result.rows[0] ? mapUserCoupon(result.rows[0]) : null;
    }

    async expireAvailableCoupons(userId: string, at: string) {
        const result = await this.db.query("UPDATE user_coupons SET status = 'expired' WHERE user_id = $1 AND status = 'available' AND expires_at <= $2 RETURNING *", [userId, at]);
        return result.rows.map(mapUserCoupon);
    }

    async createRedemption(redemption: CouponRedemptionRecord) {
        const result = await this.db.query(
            `
            INSERT INTO coupon_redemptions (id, user_coupon_id, order_id, user_id, template_id, status, discount_cents, rule_snapshot, redeemed_at, refunded_at, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            ON CONFLICT (order_id) DO NOTHING
            RETURNING *
            `,
            [
                redemption.id,
                redemption.userCouponId,
                redemption.orderId,
                redemption.userId,
                redemption.templateId,
                redemption.status,
                redemption.discountCents,
                jsonParam(redemption.ruleSnapshot),
                redemption.redeemedAt,
                redemption.refundedAt || null,
                redemption.createdAt,
                redemption.updatedAt,
            ],
        );
        return result.rows[0] ? mapCouponRedemption(result.rows[0]) : null;
    }

    async getRedemptionByOrderId(orderId: string) {
        const result = await this.db.query("SELECT * FROM coupon_redemptions WHERE order_id = $1", [orderId]);
        return result.rows[0] ? mapCouponRedemption(result.rows[0]) : null;
    }

    async refundRedemptionByOrderId(orderId: string, refundedAt: string) {
        const result = await this.db.query("UPDATE coupon_redemptions SET status = 'refunded', refunded_at = $2 WHERE order_id = $1 AND status = 'redeemed' RETURNING *", [orderId, refundedAt]);
        return result.rows[0] ? mapCouponRedemption(result.rows[0]) : this.getRedemptionByOrderId(orderId);
    }

    async deleteTemplateIfUnused(id: string) {
        const result = await this.db.query(
            `DELETE FROM coupon_templates template
             WHERE template.id = $1 AND NOT EXISTS (SELECT 1 FROM user_coupons coupon WHERE coupon.template_id = template.id)
               AND NOT EXISTS (SELECT 1 FROM referral_programs program WHERE program.invitee_coupon_template_id = template.id)
             RETURNING template.*, '[]'::jsonb AS product_ids`,
            [id],
        );
        return result.rows[0] ? mapCouponTemplate(result.rows[0]) : null;
    }
}
