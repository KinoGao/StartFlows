import { randomUUID } from "node:crypto";

import { BillingInputError } from "@/lib/server/billing-errors";
import { calculateBillingPrice, selectCurrentPromotion, type CouponPriceRule, type PromotionPrice } from "@/lib/server/billing-pricing";
import { createPostgresRepositories, withPostgresTransaction, type BillingOrderRecord, type BillingProductRecord, type CouponTemplateRecord, type JsonValue, type QueryExecutor, type UserCouponRecord } from "@/lib/server/database";
import { assertBillingDatabaseReady, normalizeId, normalizePositiveInteger } from "@/lib/server/billing-service-helpers";

export async function quoteBillingOrder(input: { userId: string; productId?: unknown; quantity?: unknown; userCouponId?: unknown }) {
    await assertBillingDatabaseReady();
    return withPostgresTransaction(async (client) => {
        const repos = createPostgresRepositories(client);
        const user = await repos.users.getById(input.userId);
        if (!user || user.status !== "active") throw new BillingInputError("用户不可用", 403);
        const product = await repos.billing.getProductById(normalizeId(input.productId));
        if (!product || !product.enabled) throw new BillingInputError("商品不存在或已下架", 404);
        const quantity = normalizePositiveInteger(input.quantity, 1, 100, 1);
        const commerce = await prepareBillingOrderCommerce({
            db: client,
            product,
            userId: user.id,
            quantity,
            userCouponId: normalizeId(input.userCouponId) || undefined,
            now: new Date(),
        });
        return { productId: product.id, quantity, ...commerce.price, pricingSnapshot: commerce.pricingSnapshot };
    });
}

export async function prepareBillingOrderCommerce(input: { db: QueryExecutor; product: BillingProductRecord; userId: string; quantity: number; userCouponId?: string; now: Date }) {
    const repos = createPostgresRepositories(input.db);
    const activePrices = await repos.promotions.listActiveProductPrices(input.now.toISOString(), [input.product.id]);
    const promotion = selectCurrentPromotion(activePrices as PromotionPrice[], input.product.amountCents, input.now);
    let coupon: UserCouponRecord | undefined;
    let template: CouponTemplateRecord | undefined;
    if (input.userCouponId) {
        coupon = (await repos.coupons.getUserCouponById(input.userCouponId, true)) || undefined;
        if (!coupon || coupon.userId !== input.userId) throw new BillingInputError("优惠券不存在", 404);
        template = (await repos.coupons.getTemplateById(coupon.templateId, true)) || undefined;
        validateCouponForOrder(coupon, template, input.product.id, input.now);
    }

    const couponRule = template ? couponRuleFromTemplate(template) : undefined;
    let price;
    try {
        price = calculateBillingPrice({ listUnitAmountCents: input.product.amountCents, quantity: input.quantity, promotion, coupon: couponRule });
    } catch (error) {
        throw new BillingInputError(error instanceof Error ? error.message : "优惠金额计算失败");
    }
    if (template && price.couponDiscountCents <= 0) throw new BillingInputError("该优惠券不能产生有效优惠", 409);

    const pricingSnapshot: JsonValue = {
        version: 1,
        product: { id: input.product.id, unitListAmountCents: input.product.amountCents, quantity: input.quantity },
        promotion: price.promotion ? { id: price.promotion.id, label: price.promotion.label, unitAmountCents: price.promotion.unitAmountCents, startsAt: price.promotion.startsAt, endsAt: price.promotion.endsAt } : null,
        coupon:
            template && coupon
                ? {
                      userCouponId: coupon.id,
                      templateId: template.id,
                      name: template.name,
                      code: template.code,
                      discountType: template.discountType,
                      discountValue: template.discountValue,
                      minimumAmountCents: template.minimumAmountCents,
                      maximumDiscountCents: template.maximumDiscountCents,
                      stackWithPromotion: template.stackWithPromotion,
                  }
                : null,
    };
    return { price, coupon, template, pricingSnapshot };
}

export async function lockBillingOrderCoupon(db: QueryExecutor, order: BillingOrderRecord, coupon: UserCouponRecord | undefined, lockedAt: string) {
    if (!coupon) return undefined;
    const updated = await createPostgresRepositories(db).coupons.updateUserCoupon(coupon.id, { status: "locked", lockedOrderId: order.id, lockedAt });
    if (!updated) throw new BillingInputError("优惠券锁定失败", 409);
    return updated;
}

export async function releaseBillingOrderCoupon(db: QueryExecutor, order: BillingOrderRecord, releasedAt = new Date().toISOString()) {
    if (!order.userCouponId) return undefined;
    const repos = createPostgresRepositories(db);
    const coupon = await repos.coupons.getUserCouponById(order.userCouponId, true);
    if (!coupon || coupon.status !== "locked" || coupon.lockedOrderId !== order.id) return coupon;
    const status = Date.parse(coupon.expiresAt) <= Date.parse(releasedAt) ? "expired" : "available";
    return repos.coupons.updateUserCoupon(coupon.id, { status, lockedOrderId: undefined, lockedAt: undefined });
}

export async function redeemBillingOrderCoupon(db: QueryExecutor, order: BillingOrderRecord, redeemedAt: string) {
    if (!order.userCouponId) return undefined;
    const repos = createPostgresRepositories(db);
    const existing = await repos.coupons.getRedemptionByOrderId(order.id);
    if (existing) return existing;
    const coupon = await repos.coupons.getUserCouponById(order.userCouponId, true);
    if (!coupon || coupon.userId !== order.userId) throw new BillingInputError("订单优惠券不存在", 409);
    const lockedByOrder = coupon.status === "locked" && coupon.lockedOrderId === order.id;
    const releasedAndUnused = coupon.status === "available" || coupon.status === "expired";
    if (!lockedByOrder && !releasedAndUnused) throw new BillingInputError("迟到支付对应的优惠券已被占用或核销，请进入对账处理", 409);

    const updated = await repos.coupons.updateUserCoupon(coupon.id, {
        status: "redeemed",
        lockedOrderId: undefined,
        lockedAt: undefined,
        redeemedOrderId: order.id,
        redeemedAt,
    });
    if (!updated) throw new BillingInputError("优惠券核销失败", 409);
    const redemption = await repos.coupons.createRedemption({
        id: randomUUID(),
        userCouponId: coupon.id,
        orderId: order.id,
        userId: coupon.userId,
        templateId: coupon.templateId,
        status: "redeemed",
        discountCents: order.couponDiscountCents,
        ruleSnapshot: order.pricingSnapshot || {},
        redeemedAt,
        createdAt: redeemedAt,
        updatedAt: redeemedAt,
    });
    if (!redemption) throw new BillingInputError("优惠券已被其他订单核销", 409);
    await repos.coupons.incrementTemplateRedeemedCount(coupon.templateId);
    return redemption;
}

export async function refundBillingOrderCoupon(db: QueryExecutor, order: BillingOrderRecord, refundedAt: string) {
    if (!order.userCouponId) return undefined;
    return createPostgresRepositories(db).coupons.refundRedemptionByOrderId(order.id, refundedAt);
}

function validateCouponForOrder(coupon: UserCouponRecord, template: CouponTemplateRecord | undefined, productId: string, now: Date) {
    if (!template || !template.enabled) throw new BillingInputError("优惠券已停用", 409);
    if (coupon.status !== "available") throw new BillingInputError(coupon.status === "locked" ? "优惠券已被其他订单锁定" : "优惠券当前不可使用", 409);
    if (Date.parse(coupon.expiresAt) <= now.getTime() || Date.parse(template.startsAt) > now.getTime() || Date.parse(template.endsAt) <= now.getTime()) throw new BillingInputError("优惠券已过期或尚未生效", 409);
    if (template.productIds.length && !template.productIds.includes(productId)) throw new BillingInputError("优惠券不适用于该商品", 409);
}

function couponRuleFromTemplate(template: CouponTemplateRecord): CouponPriceRule {
    return {
        templateId: template.id,
        type: template.discountType,
        value: template.discountValue,
        minimumAmountCents: template.minimumAmountCents,
        maximumDiscountCents: template.maximumDiscountCents,
        stackWithPromotion: template.stackWithPromotion,
    };
}
