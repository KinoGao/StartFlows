import { describe, expect, it } from "vitest";

import { randomNumericCode } from "./store-auth-utils";

describe("authentication codes", () => {
    it("creates fixed-width six digit codes", () => {
        const codes = Array.from({ length: 100 }, () => randomNumericCode());
        expect(codes.every((code) => /^\d{6}$/.test(code))).toBe(true);
    });
});
