import assert from "node:assert/strict";
import { test } from "vitest";

import { resolveComposerOverlayPosition } from "./canvas-composer-position";

test("composer keeps the node center as its horizontal anchor near canvas edges", () => {
    const position = resolveComposerOverlayPosition({
        rawLeft: 36,
        nodeBottom: 220,
        composerHeight: 360,
        canvasHeight: 900,
    });

    assert.equal(position.left, 36);
});

test("composer stays below the node when the remaining viewport height is insufficient", () => {
    const position = resolveComposerOverlayPosition({
        rawLeft: 640,
        nodeBottom: 820,
        composerHeight: 420,
        canvasHeight: 900,
    });

    assert.equal(position.top, 832);
    assert.equal(position.maxHeight, 180);
});
