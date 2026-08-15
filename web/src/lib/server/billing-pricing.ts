export type PromotionPrice = {
    id: string;
    label: string;
    unitAmountCents: number;
    startsAt: string;
    endsAt: string;
};

export type CouponPriceRule = {
    templateId: string;
    type: "fixed" | "percentage";
    value: number;
    minimumAmountCents: number;
    maximumDiscountCents: number;
    stackWithPromotion: boolean;
};

export type BillingPrice = {
    listAmountCents: number;
    promotionDiscountCents: number;
    couponDiscountCents: number;
    payableAmountCents: number;
    promotion?: PromotionPrice;
};

export function selectCurrentPromotion(promotions: PromotionPrice[], listUnitAmountCents: number, now = new Date()) {
    const time = now.getTime();
    return promotions
        .filter((promotion) => {
            const startsAt = Date.parse(promotion.startsAt);
            const endsAt = Date.parse(promotion.endsAt);
            return Number.isInteger(promotion.unitAmountCents) && promotion.unitAmountCents > 0 && promotion.unitAmountCents < listUnitAmountCents && startsAt <= time && time < endsAt;
        })
        .sort((left, right) => left.unitAmountCents - right.unitAmountCents || Date.parse(left.startsAt) - Date.parse(right.startsAt) || left.id.localeCompare(right.id))[0];
}

export function calculateBillingPrice(input: { listUnitAmountCents: number; quantity: number; promotion?: PromotionPrice; coupon?: CouponPriceRule }): BillingPrice {
    assertPositiveInteger(input.listUnitAmountCents, "商品日常价");
    assertPositiveInteger(input.quantity, "商品数量");

    const listAmountCents = input.listUnitAmountCents * input.quantity;
    if (!Number.isSafeInteger(listAmountCents)) throw new Error("订单金额超出安全范围");

    const promotionAmountCents = input.promotion?.unitAmountCents;
    const promotionEligible = Number.isInteger(promotionAmountCents) && promotionAmountCents! > 0 && promotionAmountCents! < input.listUnitAmountCents;
    const usePromotion = promotionEligible && (!input.coupon || input.coupon.stackWithPromotion);
    const subtotalCents = usePromotion ? promotionAmountCents! * input.quantity : listAmountCents;
    const promotionDiscountCents = listAmountCents - subtotalCents;
    const couponDiscountCents = input.coupon ? calculateCouponDiscount(subtotalCents, input.coupon) : 0;

    return {
        listAmountCents,
        promotionDiscountCents,
        couponDiscountCents,
        payableAmountCents: subtotalCents - couponDiscountCents,
        ...(usePromotion && input.promotion ? { promotion: input.promotion } : {}),
    };
}

function calculateCouponDiscount(subtotalCents: number, coupon: CouponPriceRule) {
    if (subtotalCents < coupon.minimumAmountCents) throw new Error("订单金额未达到优惠券使用门槛");
    const rawDiscount = coupon.type === "fixed" ? coupon.value : Math.floor((subtotalCents * coupon.value) / 10_000);
    const cappedDiscount = coupon.maximumDiscountCents > 0 ? Math.min(rawDiscount, coupon.maximumDiscountCents) : rawDiscount;
    return Math.max(0, Math.min(cappedDiscount, subtotalCents - 1));
}

function assertPositiveInteger(value: number, label: string) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label}必须为正整数`);
}
