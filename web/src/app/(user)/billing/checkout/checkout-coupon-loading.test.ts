import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("billing checkout coupon loading", () => {
    it("loads owned coupons without querying claimable wallet templates", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/billing/checkout/checkout-client.tsx"), "utf8");

        expect(source).toContain("listBillingCoupons({ productId, quantity, pageSize: 50, includeTemplates: false })");
    });
});
