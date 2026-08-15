import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BillingProductRecord, PromotionCampaignRecord } from "@/lib/server/database";

const mocks = vi.hoisted(() => ({
    client: {},
    getCampaignById: vi.fn(),
    getProductsByIds: vi.fn(),
    findOverlaps: vi.fn(),
    upsertCampaign: vi.fn(),
    replaceProducts: vi.fn(),
}));

vi.mock("@/lib/server/database", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/server/database")>()),
    createPostgresRepositories: vi.fn(() => ({
        billing: { getProductsByIds: mocks.getProductsByIds },
        promotions: {
            getCampaignById: mocks.getCampaignById,
            findOverlaps: mocks.findOverlaps,
            upsertCampaign: mocks.upsertCampaign,
            replaceProducts: mocks.replaceProducts,
        },
    })),
    ensurePostgresSchema: vi.fn(),
    isPostgresDatabaseEnabled: vi.fn(() => true),
    withPostgresTransaction: vi.fn(async (callback: (client: typeof mocks.client) => unknown) => callback(mocks.client)),
}));

import { savePromotionCampaign } from "./promotion-service";

const products = [product("product-b", "基础版", 2_000), product("product-a", "专业版", 3_000)];

describe("promotion service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCampaignById.mockImplementation(async (id: string) => savedCampaign(id));
        mocks.getProductsByIds.mockImplementation(async (ids: string[]) => products.filter((item) => ids.includes(item.id)));
        mocks.findOverlaps.mockResolvedValue([]);
    });

    it("locks products in stable order and persists valid lower prices", async () => {
        const campaign = await savePromotionCampaign({
            name: "暑期活动",
            label: "限时优惠",
            enabled: true,
            startsAt: "2026-07-01T00:00:00.000Z",
            endsAt: "2026-08-01T00:00:00.000Z",
            products: [
                { productId: "product-b", promotionalAmountCents: 1_800 },
                { productId: "product-a", promotionalAmountCents: 2_500 },
            ],
        });

        expect(campaign).toMatchObject({ name: "暑期活动" });
        expect(mocks.getProductsByIds).toHaveBeenCalledWith(["product-a", "product-b"], true);
        expect(mocks.findOverlaps).toHaveBeenCalledWith(expect.objectContaining({ productIds: ["product-a", "product-b"] }));
        expect(mocks.replaceProducts).toHaveBeenCalledWith(expect.any(String), expect.arrayContaining([{ productId: "product-a", promotionalAmountCents: 2_500 }]));
    });

    it("rejects an enabled overlapping campaign before writing", async () => {
        mocks.findOverlaps.mockResolvedValue([{ id: "existing", name: "已有活动", productId: "product-a" }]);

        await expect(
            savePromotionCampaign({
                name: "重叠活动",
                label: "限时",
                startsAt: "2026-07-01T00:00:00.000Z",
                endsAt: "2026-08-01T00:00:00.000Z",
                products: [{ productId: "product-a", promotionalAmountCents: 2_500 }],
            }),
        ).rejects.toMatchObject({ status: 409 });
        expect(mocks.upsertCampaign).not.toHaveBeenCalled();
    });

    it("rejects a promotional price that is not below the daily price", async () => {
        await expect(
            savePromotionCampaign({
                name: "无效活动",
                label: "限时",
                startsAt: "2026-07-01T00:00:00.000Z",
                endsAt: "2026-08-01T00:00:00.000Z",
                products: [{ productId: "product-a", promotionalAmountCents: 3_000 }],
            }),
        ).rejects.toMatchObject({ status: 400 });
        expect(mocks.findOverlaps).not.toHaveBeenCalled();
    });
});

function product(id: string, name: string, amountCents: number): BillingProductRecord {
    return {
        id,
        productKind: "points",
        name,
        description: "",
        amountCents,
        currency: "CNY",
        pointsAmount: 100,
        dailyPoints: 0,
        periodDays: 0,
        enabled: true,
        sortOrder: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}

function savedCampaign(id: string): PromotionCampaignRecord {
    return {
        id,
        name: "暑期活动",
        label: "限时优惠",
        enabled: true,
        startsAt: "2026-07-01T00:00:00.000Z",
        endsAt: "2026-08-01T00:00:00.000Z",
        products: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}
