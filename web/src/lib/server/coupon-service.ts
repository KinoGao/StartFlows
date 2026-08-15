import { randomUUID } from "node:crypto";

import { BillingInputError } from "@/lib/server/billing-errors";
import { calculateBillingPrice, selectCurrentPromotion, type PromotionPrice } from "@/lib/server/billing-pricing";
import { createPostgresRepositories, withPostgresTransaction, type CouponTemplateRecord, type QueryExecutor, type UserCouponListItemRecord, type UserCouponRecord } from "@/lib/server/database";
import { assertBillingDatabaseReady, normalizeId, normalizePositiveInteger, normalizeText } from "@/lib/server/billing-service-helpers";

export type CouponTemplateInput = {
    id?: unknown;
    code?: unknown;
    name?: unknown;
    description?: unknown;
    discountType?: unknown;
    discountValue?: unknown;
    minimumAmountCents?: unknown;
    maximumDiscountCents?: unknown;
    stackWithPromotion?: unknown;
    claimable?: unknown;
    enabled?: unknown;
    startsAt?: unknown;
    endsAt?: unknown;
    totalLimit?: unknown;
    perUserLimit?: unknown;
    productIds?: unknown;
    createdByUserId?: unknown;
};

export async function listCouponTemplates(input: { page?: number; pageSize?: number; includeDisabled?: boolean; keyword?: unknown; selectedId?: unknown } = {}) {
    await assertBillingDatabaseReady();
    const { keyword, selectedId, ...pageInput } = input;
    return createPostgresRepositories().coupons.listTemplates({
        ...pageInput,
        keyword: normalizeText(keyword, "", 80) || undefined,
        selectedId: normalizeId(selectedId) || undefined,
    });
}

export async function listClaimableCouponTemplates(input: { userId?: string; page?: number; pageSize?: number } = {}) {
    await assertBillingDatabaseReady();
    return createPostgresRepositories().coupons.listTemplates({ ...input, claimableOnly: true, at: new Date().toISOString() });
}

export async function saveCouponTemplate(input: CouponTemplateInput) {
    await assertBillingDatabaseReady();
    return withPostgresTransaction(async (client) => {
        const repos = createPostgresRepositories(client);
        const inputId = normalizeId(input.id);
        const current = inputId ? await repos.coupons.getTemplateById(inputId, true) : null;
        const template = normalizeTemplate(input, current);
        const products = await repos.billing.getProductsByIds(template.productIds, true);
        if (products.length !== template.productIds.length) throw new BillingInputError("优惠券包含不存在的商品", 404);
        if (current?.issuedCount) assertIssuedRulesUnchanged(current, template);
        if (template.totalLimit > 0 && template.totalLimit < template.issuedCount) throw new BillingInputError("发行总量不能低于已发放数量");

        await repos.coupons.upsertTemplate({ ...template, productIds: undefined } as Omit<CouponTemplateRecord, "productIds">);
        await repos.coupons.replaceTemplateProducts(template.id, template.productIds);
        return repos.coupons.getTemplateById(template.id);
    });
}

export async function deleteCouponTemplate(id: string) {
    await assertBillingDatabaseReady();
    return withPostgresTransaction(async (client) => {
        const repos = createPostgresRepositories(client);
        const current = await repos.coupons.getTemplateById(normalizeId(id), true);
        if (!current) throw new BillingInputError("优惠券模板不存在", 404);
        const deleted = await repos.coupons.deleteTemplateIfUnused(current.id);
        if (!deleted) throw new BillingInputError("该模板已有发放记录或正被邀请奖励引用，请停用模板", 409);
        return deleted;
    });
}

export async function issueCoupon(input: { userId: string; templateId?: unknown; code?: unknown; source?: "claim" | "admin" | "referral" }) {
    await assertBillingDatabaseReady();
    return withPostgresTransaction((client) => issueCouponInPostgresTransaction(client, input));
}

export async function issueCouponInPostgresTransaction(client: QueryExecutor, input: { userId: string; templateId?: unknown; code?: unknown; source?: "claim" | "admin" | "referral"; now?: Date }) {
    const repos = createPostgresRepositories(client);
    const user = await repos.users.getById(input.userId);
    if (!user || user.status !== "active") throw new BillingInputError("用户不可用", 403);
    const templateId = normalizeId(input.templateId);
    const code = normalizeCouponCode(input.code);
    const template = templateId ? await repos.coupons.getTemplateById(templateId, true) : code ? await repos.coupons.getTemplateByCode(code, true) : null;
    if (!template) throw new BillingInputError("优惠券不存在", 404);
    const now = input.now || new Date();
    const privilegedIssue = input.source === "admin" || input.source === "referral";
    if (!template.enabled || (!privilegedIssue && !template.claimable)) throw new BillingInputError("优惠券不可领取", 409);
    if (Date.parse(template.startsAt) > now.getTime() || Date.parse(template.endsAt) <= now.getTime()) throw new BillingInputError("优惠券不在领取有效期内", 409);
    if (template.totalLimit > 0 && template.issuedCount >= template.totalLimit) throw new BillingInputError("优惠券已领完", 409);
    const userCount = await repos.coupons.countUserCoupons(template.id, user.id);
    if (userCount >= template.perUserLimit) throw new BillingInputError("已达到该优惠券的领取上限", 409);

    const nowIso = now.toISOString();
    const coupon: UserCouponRecord = {
        id: randomUUID(),
        templateId: template.id,
        userId: user.id,
        status: "available",
        grantSource: input.source === "admin" ? "admin" : input.source === "referral" ? "referral" : "claim",
        claimedAt: nowIso,
        expiresAt: template.endsAt,
        createdAt: nowIso,
        updatedAt: nowIso,
    };
    const issued = await repos.coupons.createUserCoupon(coupon);
    await repos.coupons.incrementTemplateIssuedCount(template.id);
    return issued;
}

export async function listUserCoupons(userId: string, input: { page?: number; pageSize?: number; status?: UserCouponRecord["status"] } = {}) {
    await assertBillingDatabaseReady();
    const repos = createPostgresRepositories();
    await repos.coupons.expireAvailableCoupons(userId, new Date().toISOString());
    return repos.coupons.listUserCoupons(userId, input);
}

export async function listUserCouponsForProduct(userId: string, input: { productId: string; quantity?: unknown; page?: number; pageSize?: number; status?: UserCouponRecord["status"] }) {
    await assertBillingDatabaseReady();
    const repos = createPostgresRepositories();
    const product = await repos.billing.getProductById(normalizeId(input.productId));
    if (!product || !product.enabled) throw new BillingInputError("商品不存在或已下架", 404);
    const now = new Date();
    const quantity = normalizePositiveInteger(input.quantity, 1, 100, 1);
    const [activePrices] = await Promise.all([repos.promotions.listActiveProductPrices(now.toISOString(), [product.id]), repos.coupons.expireAvailableCoupons(userId, now.toISOString())]);
    const result = await repos.coupons.listUserCoupons(userId, input);
    const promotion = selectCurrentPromotion(activePrices as PromotionPrice[], product.amountCents, now);
    return {
        ...result,
        items: result.items.map((coupon) => {
            const reason = couponAvailabilityReason(coupon, product.id, product.amountCents, quantity, promotion, now.getTime());
            return { ...coupon, applicable: !reason, unavailableReason: reason };
        }),
    };
}

function normalizeTemplate(input: CouponTemplateInput, current: CouponTemplateRecord | null): CouponTemplateRecord {
    const now = new Date().toISOString();
    const discountType = input.discountType === undefined ? current?.discountType || "fixed" : input.discountType === "percentage" ? "percentage" : "fixed";
    const discountValue = normalizePositiveInteger(input.discountValue, 1, discountType === "percentage" ? 10_000 : 100_000_000, current?.discountValue || 0);
    const startsAt = requiredIso(input.startsAt ?? current?.startsAt, "优惠券开始时间");
    const endsAt = requiredIso(input.endsAt ?? current?.endsAt, "优惠券结束时间");
    if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new BillingInputError("优惠券结束时间必须晚于开始时间");
    const code = normalizeCouponCode(input.code ?? current?.code);
    const name = normalizeText(input.name ?? current?.name, "", 80);
    if (!code) throw new BillingInputError("请填写优惠券码");
    if (!name) throw new BillingInputError("请填写优惠券名称");
    return {
        id: current?.id || normalizeId(input.id) || randomUUID(),
        code,
        name,
        description: normalizeText(input.description ?? current?.description, "", 300),
        discountType,
        discountValue,
        minimumAmountCents: normalizePositiveInteger(input.minimumAmountCents, 0, 100_000_000, current?.minimumAmountCents || 0),
        maximumDiscountCents: normalizePositiveInteger(input.maximumDiscountCents, 0, 100_000_000, current?.maximumDiscountCents || 0),
        stackWithPromotion: input.stackWithPromotion === undefined ? current?.stackWithPromotion === true : input.stackWithPromotion === true,
        claimable: input.claimable === undefined ? current?.claimable !== false : input.claimable !== false,
        enabled: input.enabled === undefined ? current?.enabled !== false : input.enabled !== false,
        startsAt,
        endsAt,
        totalLimit: normalizePositiveInteger(input.totalLimit, 0, 1_000_000_000, current?.totalLimit || 0),
        perUserLimit: normalizePositiveInteger(input.perUserLimit, 1, 100, current?.perUserLimit || 1),
        issuedCount: current?.issuedCount || 0,
        redeemedCount: current?.redeemedCount || 0,
        createdByUserId: current?.createdByUserId || normalizeId(input.createdByUserId) || undefined,
        productIds: normalizeProductIds(input.productIds ?? current?.productIds),
        createdAt: current?.createdAt || now,
        updatedAt: now,
    };
}

function assertIssuedRulesUnchanged(current: CouponTemplateRecord, next: CouponTemplateRecord) {
    const stableCurrent = [
        current.code,
        current.discountType,
        current.discountValue,
        current.minimumAmountCents,
        current.maximumDiscountCents,
        current.stackWithPromotion,
        current.startsAt,
        current.endsAt,
        current.perUserLimit,
        current.productIds.join("|"),
    ];
    const stableNext = [next.code, next.discountType, next.discountValue, next.minimumAmountCents, next.maximumDiscountCents, next.stackWithPromotion, next.startsAt, next.endsAt, next.perUserLimit, next.productIds.join("|")];
    if (stableCurrent.some((value, index) => value !== stableNext[index])) throw new BillingInputError("优惠券已发放，只能修改名称、说明、启用状态、领取状态和发行总量", 409);
}

function normalizeProductIds(value: unknown) {
    return Array.isArray(value) ? [...new Set(value.map(normalizeId).filter(Boolean))].sort() : [];
}

function normalizeCouponCode(value: unknown) {
    return normalizeText(value, "", 40)
        .toUpperCase()
        .replace(/[^A-Z0-9_-]/g, "");
}

function requiredIso(value: unknown, label: string) {
    const timestamp = typeof value === "string" || typeof value === "number" ? Date.parse(String(value)) : Number.NaN;
    if (!Number.isFinite(timestamp)) throw new BillingInputError(`${label}无效`);
    return new Date(timestamp).toISOString();
}

function couponAvailabilityReason(coupon: UserCouponListItemRecord, productId: string, amountCents: number, quantity: number, promotion: PromotionPrice | undefined, now: number) {
    if (coupon.status !== "available") return coupon.status === "locked" ? "已被待支付订单锁定" : "当前状态不可使用";
    if (!coupon.template.enabled) return "优惠券已停用";
    if (Date.parse(coupon.expiresAt) <= now || Date.parse(coupon.template.startsAt) > now || Date.parse(coupon.template.endsAt) <= now) return "优惠券已过期或尚未生效";
    if (coupon.template.productIds.length && !coupon.template.productIds.includes(productId)) return "不适用于该商品";
    try {
        const price = calculateBillingPrice({
            listUnitAmountCents: amountCents,
            quantity,
            promotion,
            coupon: {
                templateId: coupon.template.id,
                type: coupon.template.discountType,
                value: coupon.template.discountValue,
                minimumAmountCents: coupon.template.minimumAmountCents,
                maximumDiscountCents: coupon.template.maximumDiscountCents,
                stackWithPromotion: coupon.template.stackWithPromotion,
            },
        });
        return price.couponDiscountCents > 0 ? "" : "该优惠券不能产生有效优惠";
    } catch (error) {
        return error instanceof Error ? error.message : "当前订单不可使用";
    }
}
