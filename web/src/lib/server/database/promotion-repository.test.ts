import { describe, expect, it, vi } from "vitest";

import type { QueryExecutor } from "./postgres";
import { PromotionRepository } from "./promotion-repository";

describe("PromotionRepository", () => {
    it("uses half-open overlap detection with parameterized product ids", async () => {
        const query = vi.fn(async (..._args: unknown[]) => ({ rows: [] }));
        const repository = new PromotionRepository({ query } as unknown as QueryExecutor);

        await repository.findOverlaps({
            productIds: ["product-a", "product-b"],
            startsAt: "2026-07-01T00:00:00.000Z",
            endsAt: "2026-08-01T00:00:00.000Z",
            excludeCampaignId: "campaign-one",
        });

        const [sql, params] = query.mock.calls[0] || [];
        expect(String(sql)).toContain("product.product_id = ANY($1::text[])");
        expect(String(sql)).toContain("campaign.starts_at < $3");
        expect(String(sql)).toContain("campaign.ends_at > $2");
        expect(params).toEqual([["product-a", "product-b"], "2026-07-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z", "campaign-one"]);
    });

    it("selects active prices deterministically", async () => {
        const query = vi.fn(async (..._args: unknown[]) => ({ rows: [] }));
        const repository = new PromotionRepository({ query } as unknown as QueryExecutor);

        await repository.listActiveProductPrices("2026-07-20T00:00:00.000Z", ["product-a"]);

        const [sql, params] = query.mock.calls[0] || [];
        expect(String(sql)).toContain("campaign.starts_at <= $1");
        expect(String(sql)).toContain("campaign.ends_at > $1");
        expect(String(sql)).toContain("ORDER BY product.product_id, product.promotional_amount_cents, campaign.starts_at, campaign.id");
        expect(params).toEqual(["2026-07-20T00:00:00.000Z", ["product-a"]]);
    });
});
