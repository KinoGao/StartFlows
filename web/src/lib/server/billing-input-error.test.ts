import { describe, expect, it } from "vitest";
import { BillingInputError, isBillingInputError } from "./billing-errors";

describe("isBillingInputError", () => {
    it("returns true for BillingInputError instances", () => {
        expect(isBillingInputError(new BillingInputError("test"))).toBe(true);
    });

    it("returns false for plain objects with status property", () => {
        expect(isBillingInputError({ status: 400, message: "test" })).toBe(false);
    });

    it("returns false for generic Errors", () => {
        expect(isBillingInputError(new Error("test"))).toBe(false);
    });

    it("returns false for null and undefined", () => {
        expect(isBillingInputError(null)).toBe(false);
        expect(isBillingInputError(undefined)).toBe(false);
    });
});
