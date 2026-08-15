import { randomUUID } from "node:crypto";

import { BillingInputError } from "@/lib/server/billing-errors";
import { selectCurrentPromotion, type PromotionPrice } from "@/lib/server/billing-pricing";
import { createPostgresRepositories, withPostgresTransaction, type BillingProductRecord, type PromotionCampaignRecord } from "@/lib/server/database";
import { assertBillingDatabaseReady, normalizeId, normalizePositiveInteger, normalizeText } from "@/lib/server/billing-service-helpers";

export type PromotionCampaignInput = {
    id?: unknown;
    name?: unknown;
    label?: unknown;
    enabled?: unknown;
    startsAt?: unknown;
    endsAt?: unknown;
    products?: unknown;
    createdByUserId?: unknown;
};

export async function listPromotionCampaigns(input: { page?: number; pageSize?: number; includeDisabled?: boolean } = {}) {
    await assertBillingDatabaseReady();
    return createPostgresRepositories().promotions.listCampaigns(input);
}

export async function savePromotionCampaign(input: PromotionCampaignInput) {
    await assertBillingDatabaseReady();
    return withPostgresTransaction(async (client) => {
        const repos = createPostgresRepositories(client);
        const currentId = normalizeId(input.id);
        const current = currentId ? await repos.promotions.getCampaignById(currentId, true) : null;
        const campaign = normalizeCampaign(input, current);
        const productIds = campaign.products.map((item) => item.productId).sort();
        const products = await repos.billing.getProductsByIds(productIds, true);
        if (products.length !== productIds.length) throw new BillingInputError("活动包含不存在的商品", 404);
        validatePromotionPrices(campaign, products);

        if (campaign.enabled) {
            const overlaps = await repos.promotions.findOverlaps({ productIds, startsAt: campaign.startsAt, endsAt: campaign.endsAt, excludeCampaignId: current?.id });
            if (overlaps.length) throw new BillingInputError(`商品“${overlaps[0]?.productId}”已存在时间重叠的活动`, 409);
        }

        await repos.promotions.upsertCampaign({ ...campaign, products: undefined } as Omit<PromotionCampaignRecord, "products">);
        await repos.promotions.replaceProducts(campaign.id, campaign.products);
        return repos.promotions.getCampaignById(campaign.id);
    });
}

export async function deletePromotionCampaign(id: string) {
    await assertBillingDatabaseReady();
    return withPostgresTransaction(async (client) => {
        const repos = createPostgresRepositories(client);
        const campaign = await repos.promotions.getCampaignById(normalizeId(id), true);
        if (!campaign) throw new BillingInputError("促销活动不存在", 404);
        const deleted = await repos.promotions.deleteCampaignIfUnused(campaign.id);
        if (!deleted) throw new BillingInputError("该活动已有订单引用，请停用活动", 409);
        return deleted;
    });
}

export async function resolveBillingProductPrices(products: BillingProductRecord[], now = new Date()) {
    const productIds = products.map((product) => product.id);
    const activePrices = productIds.length ? await createPostgresRepositories().promotions.listActiveProductPrices(now.toISOString(), productIds) : [];
    const byProduct = new Map<string, PromotionPrice[]>();
    for (const item of activePrices) {
        const values = byProduct.get(item.productId) || [];
        values.push(item);
        byProduct.set(item.productId, values);
    }
    return products.map((product) => ({ ...product, pricing: resolveProductPrice(product, byProduct.get(product.id) || [], now) }));
}

export function resolveProductPrice(product: BillingProductRecord, promotions: PromotionPrice[], now = new Date()) {
    const promotion = product.amountCents > 0 ? selectCurrentPromotion(promotions, product.amountCents, now) : undefined;
    const saleUnitAmountCents = promotion?.unitAmountCents ?? product.amountCents;
    return {
        listUnitAmountCents: product.amountCents,
        saleUnitAmountCents,
        discountCents: Math.max(0, product.amountCents - saleUnitAmountCents),
        ...(promotion ? { promotion } : {}),
    };
}

function normalizeCampaign(input: PromotionCampaignInput, current: PromotionCampaignRecord | null): PromotionCampaignRecord {
    const now = new Date().toISOString();
    const id = current?.id || normalizeId(input.id) || randomUUID();
    const name = normalizeText(input.name ?? current?.name, "", 80);
    const label = normalizeText(input.label ?? current?.label, "", 40);
    if (!name) throw new BillingInputError("请填写活动名称");
    if (!label) throw new BillingInputError("请填写促销标签");
    const startsAt = requiredIso(input.startsAt ?? current?.startsAt, "活动开始时间");
    const endsAt = requiredIso(input.endsAt ?? current?.endsAt, "活动结束时间");
    if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new BillingInputError("活动结束时间必须晚于开始时间");
    const products = normalizePromotionProducts(input.products ?? current?.products);
    if (!products.length) throw new BillingInputError("请至少选择一个活动商品");
    return {
        id,
        name,
        label,
        enabled: input.enabled === undefined ? current?.enabled !== false : input.enabled !== false,
        startsAt,
        endsAt,
        createdByUserId: current?.createdByUserId || normalizeId(input.createdByUserId) || undefined,
        products,
        createdAt: current?.createdAt || now,
        updatedAt: now,
    };
}

function normalizePromotionProducts(value: unknown) {
    if (!Array.isArray(value)) return [];
    const products = new Map<string, number>();
    for (const item of value) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const row = item as Record<string, unknown>;
        const productId = normalizeId(row.productId);
        if (!productId) continue;
        products.set(productId, normalizePositiveInteger(row.promotionalAmountCents, 1, 100_000_000, 0));
    }
    return [...products].map(([productId, promotionalAmountCents]) => ({ productId, promotionalAmountCents }));
}

function validatePromotionPrices(campaign: PromotionCampaignRecord, products: BillingProductRecord[]) {
    const byId = new Map(products.map((product) => [product.id, product]));
    for (const price of campaign.products) {
        const product = byId.get(price.productId);
        if (!product) throw new BillingInputError("活动包含不存在的商品", 404);
        if (price.promotionalAmountCents <= 0 || price.promotionalAmountCents >= product.amountCents) throw new BillingInputError(`商品“${product.name}”的活动价必须大于 0 且低于日常价`);
    }
}

function requiredIso(value: unknown, label: string) {
    const timestamp = typeof value === "string" || typeof value === "number" ? Date.parse(String(value)) : Number.NaN;
    if (!Number.isFinite(timestamp)) throw new BillingInputError(`${label}无效`);
    return new Date(timestamp).toISOString();
}
