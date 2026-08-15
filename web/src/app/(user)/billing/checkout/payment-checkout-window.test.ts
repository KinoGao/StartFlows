import { afterEach, describe, expect, it, vi } from "vitest";

import type { PaymentCheckout } from "@/services/api/billing";
import { openPaymentCheckoutWindow, safePaymentUrl } from "./payment-checkout-window";

describe("payment checkout window", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("opens redirect payments through a synchronous blank popup", () => {
        const popup = popupWindow();
        const open = vi.fn(() => popup);

        expect(openPaymentCheckoutWindow(checkout({ kind: "redirect", url: "https://pay.example/checkout" }), open)).toEqual({ status: "opened" });
        expect(open).toHaveBeenCalledWith("about:blank", "_blank");
        expect(popup.opener).toBeNull();
        expect(popup.location.replace).toHaveBeenCalledWith("https://pay.example/checkout");
    });

    it("opens structured form checkouts through the same-origin payment page", () => {
        const popup = popupWindow();

        expect(
            openPaymentCheckoutWindow(
                checkout({ kind: "form", form: { action: "https://pay.example/submit", method: "POST", fields: [{ name: "token", value: "safe" }] } }),
                vi.fn(() => popup),
            ),
        ).toEqual({ status: "opened" });
        expect(popup.location.replace).toHaveBeenCalledWith("/api/billing/orders/order/payment-form");
    });

    it("reports blocked popups with copyable fallback payment information", () => {
        expect(
            openPaymentCheckoutWindow(
                checkout({ kind: "redirect", url: "https://pay.example/checkout" }),
                vi.fn(() => null),
            ),
        ).toEqual({ status: "blocked", fallbackValue: "https://pay.example/checkout" });
    });

    it("rejects unsafe redirect urls before opening a blank page", () => {
        const open = vi.fn();

        expect(openPaymentCheckoutWindow(checkout({ kind: "redirect", url: "javascript:alert(1)" }), open)).toEqual({ status: "invalid", fallbackValue: "javascript:alert(1)" });
        expect(open).not.toHaveBeenCalled();
    });

    it("accepts only http and https payment urls", () => {
        expect(safePaymentUrl("https://pay.example/path")).toBe("https://pay.example/path");
        expect(safePaymentUrl("http://pay.example/path")).toBe("http://pay.example/path");
        expect(safePaymentUrl("alipays://platformapi/startapp")).toBe("");
    });

    it("rejects production http payment urls except loopback development targets", () => {
        vi.stubEnv("NODE_ENV", "production");
        expect(safePaymentUrl("http://pay.example/path")).toBe("");
        expect(safePaymentUrl("http://localhost:3000/path")).toBe("http://localhost:3000/path");
    });
});

function checkout(patch: Partial<PaymentCheckout>): PaymentCheckout {
    return { provider: "stripe", orderId: "order", orderNo: "VZ001", kind: "redirect", ...patch };
}

function popupWindow() {
    const testForm = { action: "", method: "", append: vi.fn(), submit: vi.fn() };
    const document = {
        title: "",
        body: { textContent: "", replaceChildren: vi.fn() },
        createElement: vi.fn((tagName: string) => (tagName === "form" ? testForm : { type: "", name: "", value: "" })),
    };
    return {
        opener: {} as Window | null,
        close: vi.fn(),
        location: { replace: vi.fn() },
        document,
        testForm,
    } as unknown as Window & { document: typeof document; testForm: typeof testForm };
}
