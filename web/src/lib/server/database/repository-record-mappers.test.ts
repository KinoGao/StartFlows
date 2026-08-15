import { describe, expect, it } from "vitest";

import { mapDailyPlanPointWallet, mapPointRecord } from "./repository-record-mappers";

describe("Postgres date mappers", () => {
    it("keeps date columns in ISO date format when pg returns Date objects", () => {
        const date = new Date(2026, 6, 23, 12, 0, 0);
        const wallet = mapDailyPlanPointWallet({ user_id: "user-one", date, plan_id: "free", granted_points: 1, remaining_points: 1, created_at: date, updated_at: date });
        const record = mapPointRecord({ id: "record-one", user_id: "user-one", type: "consume", amount: -1, balance_after: 0, source_date: date, created_at: date });

        expect(wallet.date).toBe("2026-07-23");
        expect(record.sourceDate).toBe("2026-07-23");
    });
});
