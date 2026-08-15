import { describe, expect, it } from "vitest";

import { countEnabledPlanProducts } from "./admin-setup-status";

describe("admin setup product counts", () => {
    it("counts only enabled plan products, excluding free entitlement and point products", () => {
        expect(countEnabledPlanProducts([{ productKind: "plan", enabled: true } as never, { productKind: "plan", enabled: true } as never, { productKind: "plan", enabled: false } as never, { productKind: "points", enabled: true } as never])).toBe(2);
    });
});
