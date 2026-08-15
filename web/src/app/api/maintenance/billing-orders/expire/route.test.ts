import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ expirePendingBillingOrders: vi.fn() }));

vi.mock("@/lib/server/billing-order-expiration-service", () => ({ expirePendingBillingOrders: mocks.expirePendingBillingOrders }));

import { POST } from "./route";

const token = "maintenance-token-at-least-thirty-two-characters";

describe("billing order expiration maintenance route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.VOZEB_PRO_MAINTENANCE_TOKEN = token;
        mocks.expirePendingBillingOrders.mockResolvedValue([]);
    });

    afterEach(() => {
        delete process.env.VOZEB_PRO_MAINTENANCE_TOKEN;
    });

    it("rejects requests without the configured bearer token", async () => {
        const response = await POST(new Request("http://localhost/api/maintenance/billing-orders/expire", { method: "POST" }));

        expect(response.status).toBe(401);
        expect(mocks.expirePendingBillingOrders).not.toHaveBeenCalled();
    });

    it("expires a bounded batch for an authorized scheduler", async () => {
        mocks.expirePendingBillingOrders.mockResolvedValue([{ id: "order-one" }, { id: "order-two" }]);

        const response = await POST(
            new Request("http://localhost/api/maintenance/billing-orders/expire", {
                method: "POST",
                headers: { authorization: `Bearer ${token}` },
            }),
        );

        expect(response.status).toBe(200);
        expect(mocks.expirePendingBillingOrders).toHaveBeenCalledWith({ limit: 500 });
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { expired: 2 } });
    });
});
