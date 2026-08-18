import assert from "node:assert/strict";
import { test } from "vitest";

import { computeStitchLayout } from "./canvas-stitch";

test("computeStitchLayout picks near-square grids", () => {
    assert.deepEqual(
        (({ cols, rows }) => ({ cols, rows }))(computeStitchLayout(1, 640, 360)),
        { cols: 1, rows: 1 },
    );
    assert.deepEqual(
        (({ cols, rows }) => ({ cols, rows }))(computeStitchLayout(4, 640, 360)),
        { cols: 2, rows: 2 },
    );
    assert.deepEqual(
        (({ cols, rows }) => ({ cols, rows }))(computeStitchLayout(9, 640, 360)),
        { cols: 3, rows: 3 },
    );
    assert.deepEqual(
        (({ cols, rows }) => ({ cols, rows }))(computeStitchLayout(10, 640, 360)),
        { cols: 4, rows: 3 },
    );
});

test("computeStitchLayout computes canvas size with gap and padding", () => {
    const layout = computeStitchLayout(4, 640, 360, 12, 24);
    assert.equal(layout.width, 24 * 2 + 2 * 640 + 12);
    assert.equal(layout.height, 24 * 2 + 2 * 360 + 12);
});
