import { describe, expect, it } from "vitest";

import { createPaymentFormPage } from "./payment-form-page";

describe("payment form page", () => {
    it("scopes form submission to the verified provider origin and escapes fields", () => {
        const page = createPaymentFormPage({
            action: "https://pay.example/submit?flow=1",
            method: "POST",
            fields: [{ name: 'token\" onfocus=\"alert(1)', value: "<script>alert(1)</script>" }],
        });

        expect(page.contentSecurityPolicy).toContain("form-action https://pay.example");
        expect(page.contentSecurityPolicy).toMatch(/script-src 'nonce-[A-Za-z0-9_-]+'/);
        expect(page.html).toContain('action="https://pay.example/submit?flow=1" method="POST"');
        expect(page.html).toContain('name="token&quot; onfocus=&quot;alert(1)"');
        expect(page.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
        expect(page.html).not.toContain("<script>alert(1)</script>");
    });
});
