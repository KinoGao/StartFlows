import { describe, expect, it } from "vitest";

import { configuredModelPointCostKeys, materializeLogicalModelPointCosts, resolveConfiguredModelPointCost } from "./model-point-cost";

const logicalModels = [
    {
        id: "writer",
        bindings: [
            { upstreamModel: "vendor-backup", enabled: true, priority: 2 },
            { upstreamModel: "vendor-primary", enabled: true, priority: 1 },
        ],
    },
];

describe("model point costs", () => {
    it("prefers the logical model price over upstream aliases", () => {
        expect(resolveConfiguredModelPointCost({ writer: 3, "vendor-primary": 8 }, "WRITER", logicalModels)).toBe(3);
    });

    it("keeps an existing upstream price working through the logical binding", () => {
        expect(resolveConfiguredModelPointCost({ "VENDOR-PRIMARY": 2.5, "vendor-backup": 6 }, "writer", logicalModels)).toBe(2.5);
    });

    it("falls back to the shared default and accepts a free model", () => {
        expect(resolveConfiguredModelPointCost({ __default__: 1.5 }, "unknown", logicalModels)).toBe(1.5);
        expect(resolveConfiguredModelPointCost({ writer: 0 }, "writer", logicalModels)).toBe(0);
    });

    it("materializes upstream prices for client-side logical model estimates", () => {
        expect(materializeLogicalModelPointCosts({ "vendor-primary": 2.5, __default__: 1 }, logicalModels)).toMatchObject({ writer: 2.5, "vendor-primary": 2.5, __default__: 1 });
    });

    it("finds logical and enabled legacy price keys for a complete reset", () => {
        expect(configuredModelPointCostKeys({ WRITER: 3, "vendor-primary": 2.5, "vendor-backup": 6, unrelated: 4 }, "writer", logicalModels)).toEqual(["WRITER", "vendor-primary", "vendor-backup"]);
    });
});
