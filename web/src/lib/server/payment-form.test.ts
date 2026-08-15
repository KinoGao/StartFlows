import { afterEach, describe, expect, it, vi } from "vitest";

import { normalizePaymentForm, parsePaymentFormHtml } from "./payment-form";

describe("payment form normalization", () => {
    afterEach(() => vi.unstubAllEnvs());

    it("extracts only a structured form and preserves duplicate fields", () => {
        expect(
            parsePaymentFormHtml('<script>window.opener.steal()</script><form action="https://pay.example/submit" method="post"><input type="hidden" name="item" value="one"><input type="hidden" name="item" value="two"><button>支付</button></form>'),
        ).toEqual({
            action: "https://pay.example/submit",
            method: "POST",
            fields: [
                { name: "item", value: "one" },
                { name: "item", value: "two" },
            ],
        });
    });

    it("resolves relative actions against the configured provider endpoint", () => {
        expect(parsePaymentFormHtml('<form action="/cashier"><input name="token" value="safe"></form>', "https://api.example.com/create")).toEqual({
            action: "https://api.example.com/cashier",
            method: "POST",
            fields: [{ name: "token", value: "safe" }],
        });
    });

    it("rejects executable or credential-bearing actions", () => {
        expect(parsePaymentFormHtml('<form action="javascript:alert(1)"></form>')).toBeUndefined();
        expect(normalizePaymentForm({ action: "https://user:secret@pay.example/", fields: {} })).toBeUndefined();
    });

    it("rejects non-loopback http actions in production", () => {
        vi.stubEnv("NODE_ENV", "production");
        expect(normalizePaymentForm({ action: "http://pay.example/submit", fields: {} })).toBeUndefined();
        expect(normalizePaymentForm({ action: "http://localhost:3000/submit", fields: {} })).toMatchObject({ action: "http://localhost:3000/submit" });
    });
});
