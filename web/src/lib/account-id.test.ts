import { describe, expect, it } from "vitest";

import { formatAccountId, parseAccountId } from "./account-id";

describe("account id", () => {
    it("uses four digits until the value naturally grows", () => {
        expect(formatAccountId(1)).toBe("0001");
        expect(formatAccountId("9999")).toBe("9999");
        expect(formatAccountId(10_000)).toBe("10000");
        expect(formatAccountId(100_000)).toBe("100000");
    });

    it("rejects invalid public ids", () => {
        expect(parseAccountId("0")).toBeUndefined();
        expect(parseAccountId("uuid-value")).toBeUndefined();
        expect(formatAccountId("uuid-value")).toBe("0000");
    });
});
