import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    ensurePostgresSchema: vi.fn(),
    expirePendingOrders: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
    createPostgresRepositories: vi.fn(() => ({ billing: { expirePendingOrders: mocks.expirePendingOrders } })),
    ensurePostgresSchema: mocks.ensurePostgresSchema,
    isPostgresDatabaseEnabled: vi.fn(() => true),
}));

import { expirePendingBillingOrders } from "./billing-order-expiration-service";

describe("billing order expiration service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.expirePendingOrders.mockResolvedValue([]);
    });

    it("clamps batch size and passes a stable expiration timestamp", async () => {
        const now = new Date("2026-07-25T00:00:00.000Z");

        await expirePendingBillingOrders({ now, limit: 999, orderId: " order-one " });

        expect(mocks.ensurePostgresSchema).toHaveBeenCalledTimes(1);
        expect(mocks.expirePendingOrders).toHaveBeenCalledWith({ expiredAt: now.toISOString(), limit: 500, orderId: "order-one" });
    });
});
