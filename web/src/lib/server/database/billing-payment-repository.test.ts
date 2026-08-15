import { describe, expect, it, vi } from "vitest";

import type { QueryExecutor } from "./postgres";
import { BillingPaymentRepository } from "./billing-payment-repository";

describe("BillingPaymentRepository targeted order queries", () => {
    it("lists all transactions for one stable order without an arbitrary page cutoff", async () => {
        const query = vi.fn(async (..._args: unknown[]) => ({ rows: [] }));
        const repository = new BillingPaymentRepository({ query } as unknown as QueryExecutor);

        await repository.listPaymentsByOrderId("order-one");

        const [sql, params] = query.mock.calls[0] || [];
        expect(String(sql)).toContain("WHERE order_id = $1");
        expect(String(sql)).not.toMatch(/LIMIT|OFFSET/);
        expect(params).toEqual(["order-one"]);
    });

    it("prefers an explicit payment identity and otherwise uses allowed statuses", async () => {
        const query = vi.fn(async (..._args: unknown[]) => ({ rows: [] }));
        const repository = new BillingPaymentRepository({ query } as unknown as QueryExecutor);

        await repository.findOrderPayment({ orderId: "order-one", preferredPaymentId: "payment-one", statuses: ["succeeded", "refunded", "succeeded"] });

        const [sql, params] = query.mock.calls[0] || [];
        expect(String(sql)).toContain("order_id = $1");
        expect(String(sql)).toContain("id = $2");
        expect(String(sql)).toContain("status = ANY($3::text[])");
        expect(String(sql)).toContain("CASE WHEN id = $2 THEN 0 ELSE 1 END");
        expect(params).toEqual(["order-one", "payment-one", ["succeeded", "refunded"]]);
    });

    it("loads the unique plan assignment from its business source", async () => {
        const query = vi.fn(async (..._args: unknown[]) => ({ rows: [] }));
        const repository = new BillingPaymentRepository({ query } as unknown as QueryExecutor);

        await repository.getPlanAssignmentBySource("order", "order-one");

        const [sql, params] = query.mock.calls[0] || [];
        expect(String(sql)).toContain("WHERE source = $1 AND source_id = $2 LIMIT 1");
        expect(params).toEqual(["order", "order-one"]);
    });
});
