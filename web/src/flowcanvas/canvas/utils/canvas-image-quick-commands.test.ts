import assert from "node:assert/strict";
import { test } from "vitest";

import { CANVAS_IMAGE_QUICK_COMMANDS, buildImageQuickCommandPrompt, type CanvasImageQuickCommandId } from "./canvas-image-quick-commands";

test("CANVAS_IMAGE_QUICK_COMMANDS covers the five LibTV quick features with unique ids", () => {
    const ids = CANVAS_IMAGE_QUICK_COMMANDS.map((command) => command.id);
    assert.deepEqual(ids, ["lens-focus", "focus-edit", "cinematic-lighting", "character-turnaround", "extrapolate-forward", "extrapolate-backward"]);
    assert.equal(new Set(ids).size, ids.length, "command ids must be unique");
    for (const command of CANVAS_IMAGE_QUICK_COMMANDS) {
        assert.ok(command.label.length > 0 && command.description.length > 0, `${command.id} needs label and description`);
    }
});

test("buildImageQuickCommandPrompt returns a non-empty Chinese preset for every command", () => {
    for (const command of CANVAS_IMAGE_QUICK_COMMANDS) {
        const prompt = buildImageQuickCommandPrompt(command.id);
        assert.ok(prompt.includes("参考图"), `${command.id} prompt must reference the source image`);
        assert.ok(prompt.length > 30, `${command.id} prompt should be specific`);
    }
});

test("buildImageQuickCommandPrompt appends the trimmed base prompt as context", () => {
    const prompt = buildImageQuickCommandPrompt("lens-focus", "  雨夜街头的少女  ");
    assert.ok(prompt.endsWith("原画面描述：雨夜街头的少女"));
    assert.equal(buildImageQuickCommandPrompt("lens-focus", "   "), buildImageQuickCommandPrompt("lens-focus"));
    assert.equal(buildImageQuickCommandPrompt("lens-focus", undefined), buildImageQuickCommandPrompt("lens-focus"));
});

test("buildImageQuickCommandPrompt distinguishes forward and backward extrapolation", () => {
    const forward = buildImageQuickCommandPrompt("extrapolate-forward" satisfies CanvasImageQuickCommandId);
    const backward = buildImageQuickCommandPrompt("extrapolate-backward" satisfies CanvasImageQuickCommandId);
    assert.ok(forward.includes("3 秒后"));
    assert.ok(backward.includes("5 秒前"));
    assert.notEqual(forward, backward);
});
