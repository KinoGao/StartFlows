import { describe, expect, it } from "vitest";
import { requestCreditCost } from "./credits";

describe("requestCreditCost", () => {
    it("calculates system-channel image cost and keeps custom channels free", () => {
        const options = { model: "gpt-image", modelPointCosts: { "gpt-image": 2 }, kind: "image" as const, count: 3 };
        expect(requestCreditCost({ ...options, apiSource: "system" })).toBe(6);
        expect(requestCreditCost({ ...options, apiSource: "custom" })).toBe(0);
    });
});
