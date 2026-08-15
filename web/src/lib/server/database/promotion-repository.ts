import type { QueryExecutor } from "@/lib/server/database/postgres";
import type { PageInput, PageResult, PromotionCampaignRecord, PromotionProductRecord } from "./repository-shared";
import { mapPromotionCampaign, normalizePage, normalizePageSize, pageResult, stringValue } from "./repository-shared";

export class PromotionRepository {
    constructor(private readonly db: QueryExecutor) {}

    async listCampaigns(input: PageInput & { includeDisabled?: boolean } = {}): Promise<PageResult<PromotionCampaignRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const result = await this.db.query(
            `
            SELECT campaign.*, count(*) OVER() AS total_count,
                coalesce((
                    SELECT jsonb_agg(jsonb_build_object('productId', product.product_id, 'promotionalAmountCents', product.promotional_amount_cents) ORDER BY product.product_id)
                    FROM promotion_products product WHERE product.campaign_id = campaign.id
                ), '[]'::jsonb) AS products
            FROM promotion_campaigns campaign
            WHERE ($1::boolean = true OR campaign.enabled = true)
            ORDER BY campaign.starts_at DESC, campaign.created_at DESC
            LIMIT $2 OFFSET $3
            `,
            [input.includeDisabled === true, pageSize, (page - 1) * pageSize],
        );
        return pageResult(result.rows.map(mapPromotionCampaign), Number(result.rows[0]?.total_count || 0), page, pageSize);
    }

    async getCampaignById(id: string, forUpdate = false) {
        const result = await this.db.query(
            `
            SELECT campaign.*,
                coalesce((
                    SELECT jsonb_agg(jsonb_build_object('productId', product.product_id, 'promotionalAmountCents', product.promotional_amount_cents) ORDER BY product.product_id)
                    FROM promotion_products product WHERE product.campaign_id = campaign.id
                ), '[]'::jsonb) AS products
            FROM promotion_campaigns campaign
            WHERE campaign.id = $1
            ${forUpdate ? "FOR UPDATE OF campaign" : ""}
            `,
            [id],
        );
        return result.rows[0] ? mapPromotionCampaign(result.rows[0]) : null;
    }

    async listActiveProductPrices(at: string, productIds?: string[]) {
        const result = await this.db.query(
            `
            SELECT campaign.id, campaign.label, campaign.starts_at, campaign.ends_at,
                product.product_id, product.promotional_amount_cents
            FROM promotion_campaigns campaign
            JOIN promotion_products product ON product.campaign_id = campaign.id
            WHERE campaign.enabled = true
              AND campaign.starts_at <= $1
              AND campaign.ends_at > $1
              AND ($2::text[] IS NULL OR product.product_id = ANY($2::text[]))
            ORDER BY product.product_id, product.promotional_amount_cents, campaign.starts_at, campaign.id
            `,
            [at, productIds?.length ? productIds : null],
        );
        return result.rows.map((row) => ({
            id: stringValue(row.id),
            productId: stringValue(row.product_id),
            label: stringValue(row.label),
            unitAmountCents: Number(row.promotional_amount_cents),
            startsAt: new Date(String(row.starts_at)).toISOString(),
            endsAt: new Date(String(row.ends_at)).toISOString(),
        }));
    }

    async findOverlaps(input: { productIds: string[]; startsAt: string; endsAt: string; excludeCampaignId?: string }) {
        if (!input.productIds.length) return [];
        const result = await this.db.query(
            `
            SELECT DISTINCT campaign.id, campaign.name, product.product_id
            FROM promotion_campaigns campaign
            JOIN promotion_products product ON product.campaign_id = campaign.id
            WHERE campaign.enabled = true
              AND product.product_id = ANY($1::text[])
              AND campaign.starts_at < $3
              AND campaign.ends_at > $2
              AND ($4::text IS NULL OR campaign.id <> $4)
            ORDER BY campaign.id, product.product_id
            `,
            [input.productIds, input.startsAt, input.endsAt, input.excludeCampaignId || null],
        );
        return result.rows.map((row) => ({ id: stringValue(row.id), name: stringValue(row.name), productId: stringValue(row.product_id) }));
    }

    async upsertCampaign(campaign: Omit<PromotionCampaignRecord, "products">) {
        const result = await this.db.query(
            `
            INSERT INTO promotion_campaigns (id, name, label, enabled, starts_at, ends_at, created_by_user_id, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                label = EXCLUDED.label,
                enabled = EXCLUDED.enabled,
                starts_at = EXCLUDED.starts_at,
                ends_at = EXCLUDED.ends_at,
                created_by_user_id = coalesce(promotion_campaigns.created_by_user_id, EXCLUDED.created_by_user_id)
            RETURNING *, '[]'::jsonb AS products
            `,
            [campaign.id, campaign.name, campaign.label, campaign.enabled, campaign.startsAt, campaign.endsAt, campaign.createdByUserId || null, campaign.createdAt, campaign.updatedAt],
        );
        return mapPromotionCampaign(result.rows[0]);
    }

    async replaceProducts(campaignId: string, products: PromotionProductRecord[]) {
        await this.db.query("DELETE FROM promotion_products WHERE campaign_id = $1", [campaignId]);
        if (!products.length) return;
        await this.db.query(
            `
            INSERT INTO promotion_products (campaign_id, product_id, promotional_amount_cents)
            SELECT $1, product_id, amount_cents
            FROM unnest($2::text[], $3::bigint[]) AS input(product_id, amount_cents)
            `,
            [campaignId, products.map((item) => item.productId), products.map((item) => item.promotionalAmountCents)],
        );
    }

    async deleteCampaignIfUnused(id: string) {
        const result = await this.db.query(
            `DELETE FROM promotion_campaigns campaign
             WHERE campaign.id = $1 AND NOT EXISTS (SELECT 1 FROM billing_orders orders WHERE orders.promotion_campaign_id = campaign.id)
             RETURNING campaign.*, '[]'::jsonb AS products`,
            [id],
        );
        return result.rows[0] ? mapPromotionCampaign(result.rows[0]) : null;
    }
}
