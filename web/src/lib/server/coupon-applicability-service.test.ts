import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getProductById: vi.fn(),
    listActiveProductPrices: vi.fn(),
    expireAvailableCoupons: vi.fn(),
    listUserCoupons: vi.fn(),
}));

vi.mock("@/lib/server/database", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/server/database")>()),
    createPostgresRepositories: vi.fn(() => ({
        billing: { getProductById: mocks.getProductById },
        promotions: { listActiveProductPrices: mocks.listActiveProductPrices },
        coupons: { expireAvailableCoupons: mocks.expireAvailableCoupons, listUserCoupons: mocks.listUserCoupons },
    })),
    ensurePostgresSchema: vi.fn(),
    isPostgresDatabaseEnabled: vi.fn(() => true),
}));

import { listUserCouponsForProduct } from "./coupon-service";

describe("coupon product applicability", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getProductById.mockResolvedValue({ id: "product-one", name: "套餐", amountCents: 1_000, enabled: true });
        mocks.listActiveProductPrices.mockResolvedValue([{ id: "promotion-one", productId: "product-one", label: "限时", unitAmountCents: 800, startsAt: "2026-01-01T00:00:00.000Z", endsAt: "2099-01-01T00:00:00.000Z" }]);
        mocks.listUserCoupons.mockResolvedValue({ items: [coupon()], total: 1, page: 1, pageSize: 20 });
    });

    it("uses quantity and the stackable promotion subtotal for the minimum", async () => {
        const one = await listUserCouponsForProduct("user-one", { productId: "product-one", quantity: 1 });
        const two = await listUserCouponsForProduct("user-one", { productId: "product-one", quantity: 2 });

        expect(one.items[0]).toMatchObject({ applicable: false, unavailableReason: "订单金额未达到优惠券使用门槛" });
        expect(two.items[0]).toMatchObject({ applicable: true, unavailableReason: "" });
        expect(mocks.listActiveProductPrices).toHaveBeenCalledWith(expect.any(String), ["product-one"]);
    });
});

function coupon() {
    return {
        id: "coupon-one",
        templateId: "template-one",
        userId: "user-one",
        status: "available",
        grantSource: "claim",
        claimedAt: "2026-01-01T00:00:00.000Z",
        expiresAt: "2099-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        template: {
            id: "template-one",
            code: "SAVE100",
            name: "满减券",
            description: "",
            discountType: "fixed",
            discountValue: 100,
            minimumAmountCents: 1_500,
            maximumDiscountCents: 0,
            stackWithPromotion: true,
            claimable: true,
            enabled: true,
            startsAt: "2026-01-01T00:00:00.000Z",
            endsAt: "2099-01-01T00:00:00.000Z",
            totalLimit: 0,
            perUserLimit: 1,
            issuedCount: 1,
            redeemedCount: 0,
            productIds: ["product-one"],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
        },
    };
}
