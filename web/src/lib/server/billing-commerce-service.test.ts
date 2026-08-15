import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BillingOrderRecord, BillingProductRecord, CouponRedemptionRecord, CouponTemplateRecord, QueryExecutor, UserCouponRecord } from "@/lib/server/database";

const mocks = vi.hoisted(() => ({
    listActiveProductPrices: vi.fn(),
    getUserCouponById: vi.fn(),
    getTemplateById: vi.fn(),
    updateUserCoupon: vi.fn(),
    getRedemptionByOrderId: vi.fn(),
    createRedemption: vi.fn(),
    incrementTemplateRedeemedCount: vi.fn(),
    refundRedemptionByOrderId: vi.fn(),
}));

vi.mock("@/lib/server/database", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/server/database")>()),
    createPostgresRepositories: vi.fn(() => ({
        promotions: { listActiveProductPrices: mocks.listActiveProductPrices },
        coupons: {
            getUserCouponById: mocks.getUserCouponById,
            getTemplateById: mocks.getTemplateById,
            updateUserCoupon: mocks.updateUserCoupon,
            getRedemptionByOrderId: mocks.getRedemptionByOrderId,
            createRedemption: mocks.createRedemption,
            incrementTemplateRedeemedCount: mocks.incrementTemplateRedeemedCount,
            refundRedemptionByOrderId: mocks.refundRedemptionByOrderId,
        },
    })),
}));

import { prepareBillingOrderCommerce, redeemBillingOrderCoupon, refundBillingOrderCoupon, releaseBillingOrderCoupon } from "./billing-commerce-service";

const now = new Date("2026-07-20T00:00:00.000Z");
const db = { query: vi.fn() } as unknown as QueryExecutor;
const product = {
    id: "creator-monthly",
    productKind: "plan",
    planId: "creator",
    name: "创作者月卡",
    description: "",
    amountCents: 1_000,
    currency: "CNY",
    pointsAmount: 500,
    dailyPoints: 10,
    periodDays: 30,
    enabled: true,
    sortOrder: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
} satisfies BillingProductRecord;
const template = {
    id: "new-user",
    code: "NEW150",
    name: "新客券",
    description: "",
    discountType: "fixed",
    discountValue: 150,
    minimumAmountCents: 500,
    maximumDiscountCents: 0,
    stackWithPromotion: false,
    claimable: true,
    enabled: true,
    startsAt: "2026-07-01T00:00:00.000Z",
    endsAt: "2026-08-01T00:00:00.000Z",
    totalLimit: 100,
    perUserLimit: 1,
    issuedCount: 1,
    redeemedCount: 0,
    productIds: [product.id],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
} satisfies CouponTemplateRecord;
const coupon = {
    id: "coupon-one",
    templateId: template.id,
    userId: "user-one",
    status: "available",
    grantSource: "claim",
    claimedAt: now.toISOString(),
    expiresAt: template.endsAt,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
} satisfies UserCouponRecord;

function order(overrides: Partial<BillingOrderRecord> = {}): BillingOrderRecord {
    return {
        id: "order-one",
        orderNo: "VZ001",
        productId: product.id,
        userId: coupon.userId,
        productKind: "plan",
        planId: "creator",
        status: "pending",
        subject: product.name,
        listAmountCents: 1_000,
        promotionDiscountCents: 0,
        couponDiscountCents: 150,
        amountCents: 850,
        currency: "CNY",
        pointsAmount: 500,
        dailyPoints: 10,
        periodDays: 30,
        quantity: 1,
        provider: "stripe",
        userCouponId: coupon.id,
        pricingSnapshot: { coupon: { templateId: template.id } },
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        ...overrides,
    };
}

describe("billing commerce service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.listActiveProductPrices.mockResolvedValue([{ id: "summer", productId: product.id, label: "限时优惠", unitAmountCents: 800, startsAt: template.startsAt, endsAt: template.endsAt }]);
        mocks.getUserCouponById.mockResolvedValue({ ...coupon });
        mocks.getTemplateById.mockResolvedValue({ ...template });
        mocks.getRedemptionByOrderId.mockResolvedValue(null);
        mocks.updateUserCoupon.mockImplementation(async (_id: string, patch: Partial<UserCouponRecord>) => ({ ...coupon, ...patch }));
        mocks.createRedemption.mockImplementation(async (record: CouponRedemptionRecord) => record);
        mocks.refundRedemptionByOrderId.mockResolvedValue({ status: "refunded" });
    });

    it("uses the authoritative coupon rule and replaces a non-stackable promotion", async () => {
        const result = await prepareBillingOrderCommerce({ db, product, userId: coupon.userId, quantity: 1, userCouponId: coupon.id, now });

        expect(result.price).toMatchObject({ listAmountCents: 1_000, promotionDiscountCents: 0, couponDiscountCents: 150, payableAmountCents: 850 });
        expect(result.pricingSnapshot).toMatchObject({ coupon: { userCouponId: coupon.id, templateId: template.id }, promotion: null });
        expect(mocks.getUserCouponById).toHaveBeenCalledWith(coupon.id, true);
        expect(mocks.getTemplateById).toHaveBeenCalledWith(template.id, true);
    });

    it("rejects a coupon owned by another user without exposing it", async () => {
        await expect(prepareBillingOrderCommerce({ db, product, userId: "other-user", quantity: 1, userCouponId: coupon.id, now })).rejects.toMatchObject({ status: 404 });
    });

    it("releases only a lock owned by the closing order", async () => {
        mocks.getUserCouponById.mockResolvedValue({ ...coupon, status: "locked", lockedOrderId: "order-one", lockedAt: now.toISOString() });

        await releaseBillingOrderCoupon(db, order(), now.toISOString());

        expect(mocks.updateUserCoupon).toHaveBeenCalledWith(coupon.id, { status: "available", lockedOrderId: undefined, lockedAt: undefined });
    });

    it("marks an expired coupon accurately when a pending order releases it", async () => {
        mocks.getUserCouponById.mockResolvedValue({ ...coupon, status: "locked", lockedOrderId: "order-one", lockedAt: now.toISOString(), expiresAt: "2026-07-19T00:00:00.000Z" });

        await releaseBillingOrderCoupon(db, order(), now.toISOString());

        expect(mocks.updateUserCoupon).toHaveBeenCalledWith(coupon.id, { status: "expired", lockedOrderId: undefined, lockedAt: undefined });
    });

    it("redeems once and records the order snapshot", async () => {
        mocks.getUserCouponById.mockResolvedValue({ ...coupon, status: "locked", lockedOrderId: "order-one", lockedAt: now.toISOString() });

        const result = await redeemBillingOrderCoupon(db, order(), now.toISOString());

        expect(result).toMatchObject({ orderId: "order-one", userCouponId: coupon.id, discountCents: 150, status: "redeemed" });
        expect(mocks.incrementTemplateRedeemedCount).toHaveBeenCalledWith(template.id);
        expect(mocks.updateUserCoupon).toHaveBeenCalledWith(coupon.id, expect.objectContaining({ status: "redeemed", redeemedOrderId: "order-one" }));
    });

    it("rejects a late payment after the coupon was consumed elsewhere", async () => {
        mocks.getUserCouponById.mockResolvedValue({ ...coupon, status: "redeemed", redeemedOrderId: "another-order" });

        await expect(redeemBillingOrderCoupon(db, order({ status: "closed" }), now.toISOString())).rejects.toMatchObject({ status: 409 });
        expect(mocks.createRedemption).not.toHaveBeenCalled();
    });

    it("redeems an expired but otherwise unused coupon for a trusted late payment", async () => {
        mocks.getUserCouponById.mockResolvedValue({ ...coupon, status: "expired", expiresAt: "2026-07-19T00:00:00.000Z" });

        const result = await redeemBillingOrderCoupon(db, order({ status: "closed" }), now.toISOString());

        expect(result).toMatchObject({ orderId: "order-one", userCouponId: coupon.id, status: "redeemed" });
        expect(mocks.updateUserCoupon).toHaveBeenCalledWith(coupon.id, expect.objectContaining({ status: "redeemed", redeemedOrderId: "order-one" }));
    });

    it("marks the original redemption refunded without returning the coupon", async () => {
        await refundBillingOrderCoupon(db, order({ status: "refunding" }), now.toISOString());

        expect(mocks.refundRedemptionByOrderId).toHaveBeenCalledWith("order-one", now.toISOString());
        expect(mocks.updateUserCoupon).not.toHaveBeenCalled();
    });
});
