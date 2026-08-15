import { describe, expect, it } from "vitest";

import { formatConversionRate } from "./admin-commerce-conversion";

describe("formatConversionRate", () => {
    it("formats the measured ratio without hiding values above one hundred percent", () => {
        expect(formatConversionRate(5, 8)).toBe("62.5%");
        expect(formatConversionRate(12, 10)).toBe("120%");
    });

    it("does not invent a conversion rate without a denominator", () => {
        expect(formatConversionRate(0, 0)).toBe("-");
    });
});
