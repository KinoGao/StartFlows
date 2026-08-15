import { describe, expect, it, vi } from "vitest";

import type { QueryExecutor } from "./postgres";
import { ReferralRepository } from "./referral-repository";

describe("ReferralRepository.listRelationships", () => {
    it("searches inviter and invitee by padded public account id", async () => {
        const query = vi.fn(async (..._args: unknown[]) => ({ rows: [] }));
        const repository = new ReferralRepository({ query } as unknown as QueryExecutor);

        await repository.listRelationships({ keyword: "0001", page: 1, pageSize: 20 });

        const [sql, params] = query.mock.calls[0] || [];
        expect(String(sql)).toContain("lpad(inviter.account_id::text, 4, '0') LIKE $2");
        expect(String(sql)).toContain("lpad(invitee.account_id::text, 4, '0') LIKE $2");
        expect(params).toEqual(["0001", "%0001%", null, null, null, 20, 0]);
    });

    it("can export relationships where the user is either inviter or invitee", async () => {
        const query = vi.fn(async (..._args: unknown[]) => ({ rows: [] }));
        const repository = new ReferralRepository({ query } as unknown as QueryExecutor);

        await repository.listRelationships({ participantUserId: "user-one", page: 1, pageSize: 100 });

        const [sql, params] = query.mock.calls[0] || [];
        expect(String(sql)).toContain("relationship.inviter_user_id = $5 OR relationship.invitee_user_id = $5");
        expect(params).toEqual(["", "%%", null, null, "user-one", 100, 0]);
    });
});
