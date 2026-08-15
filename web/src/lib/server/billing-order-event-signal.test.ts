import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    notify: undefined as ((payload: string) => void) | undefined,
    unsubscribe: vi.fn(),
    subscribe: vi.fn(async (_channel: string, listener: (payload: string) => void) => {
        mocks.notify = listener;
        return mocks.unsubscribe;
    }),
}));

vi.mock("@/lib/server/database", () => ({ subscribePostgresNotification: mocks.subscribe }));

import { subscribeBillingOrderEvent } from "./billing-order-event-signal";

describe("billing order event signal", () => {
    it("filters PostgreSQL notifications by stable order ID", async () => {
        const listener = vi.fn();
        const unsubscribe = await subscribeBillingOrderEvent(" order-one ", listener);

        expect(mocks.subscribe).toHaveBeenCalledWith("vozeb_pro_billing_order_events", expect.any(Function));
        mocks.notify?.("order-two");
        expect(listener).not.toHaveBeenCalled();
        mocks.notify?.(" order-one ");
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
        expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    });
});
