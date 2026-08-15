import { describe, expect, it } from "vitest";

import { calculateBillingPrice, selectCurrentPromotion, type CouponPriceRule, type PromotionPrice } from "./billing-pricing";

const promotion = {
    id: "summer",
    label: "限时优惠",
    unitAmountCents: 800,
    startsAt: "2026-07-01T00:00:00.000Z",
    endsAt: "2026-08-01T00:00:00.000Z",
} satisfies PromotionPrice;

const fixedCoupon = {
    templateId: "new-user",
    type: "fixed",
    value: 150,
    minimumAmountCents: 500,
    maximumDiscountCents: 0,
    stackWithPromotion: false,
} satisfies CouponPriceRule;

describe("billing pricing", () => {
    it("selects the lowest active promotion with half-open time bounds", () => {
        const later = { ...promotion, id: "later", unitAmountCents: 700, startsAt: promotion.endsAt, endsAt: "2026-09-01T00:00:00.000Z" };
        const invalid = { ...promotion, id: "fake-original", unitAmountCents: 1_200 };

        expect(selectCurrentPromotion([later, invalid, promotion], 1_000, new Date("2026-07-15T00:00:00.000Z"))).toEqual(promotion);
        expect(selectCurrentPromotion([promotion], 1_000, new Date(promotion.endsAt))).toBeUndefined();
    });

    it("applies an active promotion to every unit", () => {
        expect(calculateBillingPrice({ listUnitAmountCents: 1_000, quantity: 2, promotion })).toEqual({
            listAmountCents: 2_000,
            promotionDiscountCents: 400,
            couponDiscountCents: 0,
            payableAmountCents: 1_600,
            promotion,
        });
    });

    it("replaces the promotion when the coupon cannot stack", () => {
        expect(calculateBillingPrice({ listUnitAmountCents: 1_000, quantity: 1, promotion, coupon: fixedCoupon })).toEqual({
            listAmountCents: 1_000,
            promotionDiscountCents: 0,
            couponDiscountCents: 150,
            payableAmountCents: 850,
        });
    });

    it("applies a capped percentage coupon after the promotion when stacking is enabled", () => {
        expect(
            calculateBillingPrice({
                listUnitAmountCents: 1_000,
                quantity: 2,
                promotion,
                coupon: { ...fixedCoupon, type: "percentage", value: 2_500, maximumDiscountCents: 300, stackWithPromotion: true },
            }),
        ).toMatchObject({ listAmountCents: 2_000, promotionDiscountCents: 400, couponDiscountCents: 300, payableAmountCents: 1_300 });
    });

    it("enforces the coupon threshold and keeps at least one cent payable", () => {
        expect(() => calculateBillingPrice({ listUnitAmountCents: 400, quantity: 1, coupon: fixedCoupon })).toThrow("未达到优惠券使用门槛");
        expect(calculateBillingPrice({ listUnitAmountCents: 1_000, quantity: 1, coupon: { ...fixedCoupon, value: 5_000 } }).payableAmountCents).toBe(1);
    });
});
