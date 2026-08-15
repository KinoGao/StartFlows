import { describe, expect, it } from "vitest";

import { masonryPlacements, masonryRowSpan } from "./responsive-masonry-grid";

describe("responsive masonry grid", () => {
    it("calculates the grid span from the rendered card height and row gap", () => {
        expect(masonryRowSpan(640, 4, 8)).toBe(54);
        expect(masonryRowSpan(360, 4, 12)).toBe(24);
    });

    it("keeps empty or transient measurements on at least one row", () => {
        expect(masonryRowSpan(0, 4, 8)).toBe(1);
    });

    it("fills the first row from left to right and then uses the shortest column", () => {
        expect(masonryPlacements([10, 4, 8, 5, 3], 3)).toEqual([
            { column: 1, rowStart: 1, rowSpan: 10 },
            { column: 2, rowStart: 1, rowSpan: 4 },
            { column: 3, rowStart: 1, rowSpan: 8 },
            { column: 2, rowStart: 5, rowSpan: 5 },
            { column: 3, rowStart: 9, rowSpan: 3 },
        ]);
    });
});
