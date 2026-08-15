import { describe, expect, it } from "vitest";

import { pointsResponseHeaders } from "./points-response";

describe("pointsResponseHeaders", () => {
    it("writes only finite balances", () => {
        expect(pointsResponseHeaders(123.5).get("x-vozeb-pro-points-remaining")).toBe("123.5");
        expect(pointsResponseHeaders(Number.NaN).has("x-vozeb-pro-points-remaining")).toBe(false);
    });
});
