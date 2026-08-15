import { afterEach, describe, expect, it, vi } from "vitest";

import { listBillingCoupons, subscribeBillingOrder } from "./billing";

describe("billing API client", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("sends the requested coupon page and page size to the server", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ code: 0, data: { coupons: [{ id: "coupon-page-two" }], templates: [], total: 18, page: 2, pageSize: 8 }, msg: "" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        const result = await listBillingCoupons({ page: 2, pageSize: 8 });

        expect(fetchMock).toHaveBeenCalledWith("/api/billing/coupons?page=2&pageSize=8", { cache: "no-store" });
        expect(result).toMatchObject({ coupons: [{ id: "coupon-page-two" }], total: 18, page: 2, pageSize: 8 });
    });

    it("can skip claimable templates when the caller only needs owned coupons", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: vi.fn().mockResolvedValue({ code: 0, data: { coupons: [], total: 0, page: 1, pageSize: 50 }, msg: "" }),
        });
        vi.stubGlobal("fetch", fetchMock);

        await listBillingCoupons({ productId: "product-one", quantity: 2, pageSize: 50, includeTemplates: false });

        expect(fetchMock).toHaveBeenCalledWith("/api/billing/coupons?pageSize=50&productId=product-one&quantity=2&includeTemplates=false", { cache: "no-store" });
    });

    it("subscribes to one order and closes after a terminal status", () => {
        class FakeEventSource {
            static instance: FakeEventSource;
            onmessage: ((event: MessageEvent<string>) => void) | null = null;
            onerror: (() => void) | null = null;
            close = vi.fn();

            constructor(readonly url: string) {
                FakeEventSource.instance = this;
            }
        }
        vi.stubGlobal("EventSource", FakeEventSource);
        const onOrder = vi.fn();
        const onError = vi.fn();

        const unsubscribe = subscribeBillingOrder("order one", onOrder, onError);
        const source = FakeEventSource.instance;
        source.onmessage?.({ data: JSON.stringify({ code: 0, data: { order: { id: "order one", status: "paid" } }, msg: "" }) } as MessageEvent<string>);

        expect(source.url).toBe("/api/billing/orders/order%20one/events");
        expect(onOrder).toHaveBeenCalledWith(expect.objectContaining({ id: "order one", status: "paid" }));
        expect(source.close).toHaveBeenCalledTimes(1);
        expect(onError).not.toHaveBeenCalled();
        unsubscribe();
        expect(source.close).toHaveBeenCalledTimes(2);
    });
});
