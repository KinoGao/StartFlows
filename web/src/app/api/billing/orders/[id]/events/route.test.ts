import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    getBillingOrderForUser: vi.fn(),
    listener: undefined as (() => void) | undefined,
    unsubscribe: vi.fn(),
    subscribe: vi.fn(async (_orderId: string, listener: () => void) => {
        mocks.listener = listener;
        return mocks.unsubscribe;
    }),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/billing-order-event-signal", () => ({ subscribeBillingOrderEvent: mocks.subscribe }));
vi.mock("@/lib/server/billing-service", () => ({
    getBillingOrderForUser: mocks.getBillingOrderForUser,
    isBillingInputError: vi.fn((error) => Boolean(error && typeof error === "object" && "status" in error)),
}));

import { GET } from "./route";

const pendingOrder = { id: "order-one", userId: "user-one", orderNo: "VZ001", status: "pending", updatedAt: "2026-08-11T00:00:00.000Z" };
const paidOrder = { ...pendingOrder, status: "paid", updatedAt: "2026-08-11T00:00:01.000Z" };

describe("GET /api/billing/orders/[id]/events", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.listener = undefined;
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one", role: "user" });
    });

    it("streams the current order and closes after a notified terminal state", async () => {
        mocks.getBillingOrderForUser.mockResolvedValueOnce(pendingOrder).mockResolvedValueOnce(pendingOrder).mockResolvedValueOnce(paidOrder);

        const response = await GET(new Request("http://localhost/api/billing/orders/order-one/events"), { params: Promise.resolve({ id: "order-one" }) });
        await vi.waitFor(() => expect(mocks.subscribe).toHaveBeenCalledWith("order-one", expect.any(Function)));
        mocks.listener?.();
        const body = await response.text();

        expect(response.headers.get("content-type")).toContain("text/event-stream");
        expect(body).toContain('"status":"pending"');
        expect(body).toContain('"status":"paid"');
        expect(mocks.getBillingOrderForUser).toHaveBeenCalledTimes(3);
        expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
    });

    it("returns an owned terminal order without opening a subscription", async () => {
        mocks.getBillingOrderForUser.mockResolvedValue(paidOrder);

        const response = await GET(new Request("http://localhost/api/billing/orders/order-one/events"), { params: Promise.resolve({ id: "order-one" }) });

        expect(await response.text()).toContain('"status":"paid"');
        expect(mocks.subscribe).not.toHaveBeenCalled();
    });

    it("requires a signed-in user", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);

        const response = await GET(new Request("http://localhost/api/billing/orders/order-one/events"), { params: Promise.resolve({ id: "order-one" }) });

        expect(response.status).toBe(401);
        expect(mocks.getBillingOrderForUser).not.toHaveBeenCalled();
    });
});
