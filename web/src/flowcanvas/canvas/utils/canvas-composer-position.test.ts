import assert from "node:assert/strict";
import { test } from "vitest";

import { resolveComposerOverlayPosition } from "./canvas-composer-position";

test("composer keeps the node center as its horizontal anchor when it fits the viewport", () => {
    const position = resolveComposerOverlayPosition({
        rawLeft: 640,
        nodeBottom: 220,
        composerHeight: 360,
        canvasHeight: 900,
        canvasWidth: 1440,
        panelWidth: 680,
    });

    assert.equal(position.left, 640);
});

test("composer clamps its center so the panel stays inside the left viewport edge", () => {
    const position = resolveComposerOverlayPosition({
        rawLeft: 36,
        nodeBottom: 220,
        composerHeight: 360,
        canvasHeight: 900,
        canvasWidth: 1440,
        panelWidth: 680,
    });

    // 12px 边距 + 半宽 340 → 中心最小 352
    assert.equal(position.left, 352);
});

test("composer clamps its center so the panel stays inside the right viewport edge", () => {
    const position = resolveComposerOverlayPosition({
        rawLeft: 1400,
        nodeBottom: 220,
        composerHeight: 360,
        canvasHeight: 900,
        canvasWidth: 1440,
        panelWidth: 680,
    });

    // 1440 - 12 - 340 → 中心最大 1088
    assert.equal(position.left, 1088);
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
