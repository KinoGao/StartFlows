import { describe, expect, it } from "vitest";

import { buildSpatialIndex, querySpatialIndex } from "./canvas-spatial-index";

describe("canvas spatial index", () => {
    it("跨多个网格的节点只返回一次，并保留原始顺序", () => {
        const index = buildSpatialIndex(
            [
                { id: "first", left: 0, top: 0, right: 800, bottom: 800 },
                { id: "second", left: 450, top: 450, right: 520, bottom: 520 },
            ],
            (item) => item,
        );

        expect(querySpatialIndex(index, { left: 400, top: 400, right: 600, bottom: 600 }).map(({ item }) => item.id)).toEqual(["first", "second"]);
    });

    it("仅返回与查询范围相交的节点", () => {
        const index = buildSpatialIndex(
            [
                { id: "near", left: 100, top: 100, right: 200, bottom: 200 },
                { id: "far", left: 900, top: 900, right: 1000, bottom: 1000 },
            ],
            (item) => item,
        );

        expect(querySpatialIndex(index, { left: 150, top: 150, right: 250, bottom: 250 }).map(({ item }) => item.id)).toEqual(["near"]);
    });
});
