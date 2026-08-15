import { describe, expect, it } from "vitest";

import type { StoredUser } from "./store-types";
import { emptyDb, normalizeDb } from "./store-normalizers";

const timestamp = "2026-01-01T00:00:00.000Z";

function storedUser(id: string, accountId?: string) {
    return {
        id,
        ...(accountId ? { accountId } : {}),
        username: id,
        displayName: id,
        bio: "",
        role: "user" as const,
        status: "active" as const,
        planId: "free",
        pointsBalance: 0,
        passwordHash: "hash",
        createdAt: timestamp,
        updatedAt: timestamp,
    };
}

describe("file-provider account ids", () => {
    it("assigns missing ids in user order and preserves the next value", () => {
        const source = { ...emptyDb(), nextUserAccountId: 1, users: [storedUser("first"), storedUser("second")] as StoredUser[] };

        const normalized = normalizeDb(source);

        expect(normalized.users.map((user) => user.accountId)).toEqual(["0001", "0002"]);
        expect(normalized.nextUserAccountId).toBe(3);
    });

    it("continues with five digits after 9999", () => {
        const source = { ...emptyDb(), nextUserAccountId: 10_000, users: [storedUser("existing", "9999")] as StoredUser[] };

        const normalized = normalizeDb(source);

        expect(normalized.users[0]?.accountId).toBe("9999");
        expect(normalized.nextUserAccountId).toBe(10_000);
    });
});
