import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { BillingPlanGrid } from "@/components/billing/billing-plan-grid";
import type { BillingProduct } from "@/services/api/billing";

describe("BillingPlanGrid", () => {
    it("keeps eight modal plans compact and reachable on desktop and mobile", () => {
        const products = Array.from({ length: 8 }, (_, index) => product(index + 1));
        const markup = renderToStaticMarkup(<BillingPlanGrid products={products} variant="modal" onSelect={vi.fn()} />);

        expect(markup.match(/data-billing-plan-card=/g)).toHaveLength(9);
        expect(markup.match(/role="tab"/g)).toHaveLength(8);
        expect(markup).toContain('data-billing-plan-layout="modal"');
        expect(markup).toContain("lg:grid-cols-4");
        expect(markup).toContain('data-billing-plan-density="compact"');
    });
});

function product(index: number): BillingProduct {
    return {
        id: `product-${index}`,
        productKind: "plan",
        planId: `plan-${index}`,
        name: `创作套餐 ${index}`,
        description: "适合持续进行图片、视频与 Agent 创作。",
        amountCents: index * 1_000,
        currency: "CNY",
        pointsAmount: index * 1_000,
        dailyPoints: index * 10,
        periodDays: 30,
        enabled: true,
        sortOrder: index,
        metadata: index === 2 ? { recommended: true } : undefined,
        pricing: {
            listUnitAmountCents: index * 1_200,
            saleUnitAmountCents: index * 1_000,
            discountCents: index * 200,
        },
        createdAt: "2026-08-03T00:00:00.000Z",
        updatedAt: "2026-08-03T00:00:00.000Z",
    };
}
