import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CouponTemplateRecord, UserCouponRecord } from "@/lib/server/database";

const mocks = vi.hoisted(() => ({
    client: {},
    getUserById: vi.fn(),
    getTemplateById: vi.fn(),
    getTemplateByCode: vi.fn(),
    listTemplates: vi.fn(),
    countUserCoupons: vi.fn(),
    createUserCoupon: vi.fn(),
    incrementTemplateIssuedCount: vi.fn(),
}));

vi.mock("@/lib/server/database", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/server/database")>()),
    createPostgresRepositories: vi.fn(() => ({
        users: { getById: mocks.getUserById },
        coupons: {
            listTemplates: mocks.listTemplates,
            getTemplateById: mocks.getTemplateById,
            getTemplateByCode: mocks.getTemplateByCode,
            countUserCoupons: mocks.countUserCoupons,
            createUserCoupon: mocks.createUserCoupon,
            incrementTemplateIssuedCount: mocks.incrementTemplateIssuedCount,
        },
    })),
    ensurePostgresSchema: vi.fn(),
    isPostgresDatabaseEnabled: vi.fn(() => true),
    withPostgresTransaction: vi.fn(async (callback: (client: typeof mocks.client) => unknown) => callback(mocks.client)),
}));

import { issueCoupon, listCouponTemplates } from "./coupon-service";

const template = {
    id: "new-user",
    code: "NEW100",
    name: "新客券",
    description: "",
    discountType: "fixed",
    discountValue: 100,
    minimumAmountCents: 500,
    maximumDiscountCents: 0,
    stackWithPromotion: false,
    claimable: true,
    enabled: true,
    startsAt: "2026-01-01T00:00:00.000Z",
    endsAt: "2099-01-01T00:00:00.000Z",
    totalLimit: 2,
    perUserLimit: 1,
    issuedCount: 0,
    redeemedCount: 0,
    productIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
} satisfies CouponTemplateRecord;

describe("coupon template listing", () => {
    it("normalizes the optional search and selected template before querying", async () => {
        mocks.listTemplates.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

        await listCouponTemplates({ page: 1, pageSize: 20, includeDisabled: false, keyword: "  新客券  ", selectedId: " current template " });

        expect(mocks.listTemplates).toHaveBeenCalledWith({ page: 1, pageSize: 20, includeDisabled: false, keyword: "新客券", selectedId: "currenttemplate" });
    });
});

describe("coupon issuance", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getUserById.mockResolvedValue({ id: "user-one", status: "active" });
        mocks.getTemplateById.mockResolvedValue({ ...template });
        mocks.getTemplateByCode.mockResolvedValue({ ...template });
        mocks.countUserCoupons.mockResolvedValue(0);
        mocks.createUserCoupon.mockImplementation(async (coupon: UserCouponRecord) => coupon);
    });

    it("locks the template, creates one user coupon, and increments issuance", async () => {
        const result = await issueCoupon({ userId: "user-one", templateId: template.id, source: "claim" });

        expect(result).toMatchObject({ templateId: template.id, userId: "user-one", status: "available", grantSource: "claim" });
        expect(mocks.getTemplateById).toHaveBeenCalledWith(template.id, true);
        expect(mocks.incrementTemplateIssuedCount).toHaveBeenCalledWith(template.id);
    });

    it("enforces the per-user limit before creating a record", async () => {
        mocks.countUserCoupons.mockResolvedValue(1);

        await expect(issueCoupon({ userId: "user-one", code: template.code, source: "claim" })).rejects.toMatchObject({ status: 409 });
        expect(mocks.getTemplateByCode).toHaveBeenCalledWith(template.code, true);
        expect(mocks.createUserCoupon).not.toHaveBeenCalled();
    });

    it("enforces the global total while holding the template row", async () => {
        mocks.getTemplateById.mockResolvedValue({ ...template, issuedCount: 2 });

        await expect(issueCoupon({ userId: "user-one", templateId: template.id, source: "claim" })).rejects.toMatchObject({ status: 409 });
        expect(mocks.countUserCoupons).not.toHaveBeenCalled();
    });
});
