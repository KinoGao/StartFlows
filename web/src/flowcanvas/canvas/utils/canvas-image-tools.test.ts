import assert from "node:assert/strict";
import { test } from "vitest";

import {
    IMAGE_ERASE_PROMPT,
    LIGHTING_COLORS,
    LIGHTING_DIRECTIONS,
    LIGHTING_INTENSITIES,
    OUTPAINT_RATIOS,
    buildCutoutPrompt,
    buildLightingPrompt,
    buildOutpaintPrompt,
    buildPanorama720Prompt,
} from "./canvas-image-tools";

test("OUTPAINT_RATIOS covers the six LibTV aspect presets with unique ids", () => {
    const ids = OUTPAINT_RATIOS.map((ratio) => ratio.id);
    assert.deepEqual(ids, ["1:1", "4:3", "3:4", "16:9", "9:16", "21:9"]);
    assert.equal(new Set(ids).size, ids.length, "ratio ids must be unique");
    for (const ratio of OUTPAINT_RATIOS) {
        assert.ok(ratio.width > 0 && ratio.height > 0, `${ratio.id} needs positive dimensions`);
    }
});

test("buildOutpaintPrompt mentions the target ratio and falls back to 1:1 for unknown ids", () => {
    const prompt = buildOutpaintPrompt("16:9");
    assert.ok(prompt.includes("16:9"));
    assert.ok(prompt.includes("参考图"));
    assert.ok(prompt.includes("向外扩展"));
    assert.ok(buildOutpaintPrompt("unknown").includes("1:1"));
});

test("buildCutoutPrompt keeps the subject and replaces the background", () => {
    const prompt = buildCutoutPrompt();
    assert.ok(prompt.includes("主体"));
    assert.ok(prompt.includes("背景"));
    assert.ok(prompt.includes("参考图"));
});

test("buildPanorama720Prompt specifies the equirectangular panorama format", () => {
    const prompt = buildPanorama720Prompt();
    assert.ok(prompt.includes("720°"));
    assert.ok(prompt.includes("equirectangular"));
    assert.ok(prompt.includes("2:1"));
});

test("preset prompts append the trimmed base prompt as context", () => {
    assert.ok(buildOutpaintPrompt("1:1", "  山顶日出  ").endsWith("原画面描述：山顶日出"));
    assert.ok(buildCutoutPrompt("红色运动鞋").endsWith("原画面描述：红色运动鞋"));
    assert.ok(buildPanorama720Prompt("未来城市").endsWith("原画面描述：未来城市"));
    assert.equal(buildCutoutPrompt("   "), buildCutoutPrompt());
});

test("IMAGE_ERASE_PROMPT describes removing the masked area content", () => {
    assert.ok(IMAGE_ERASE_PROMPT.includes("蒙版"));
    assert.ok(IMAGE_ERASE_PROMPT.includes("移除"));
    assert.ok(IMAGE_ERASE_PROMPT.includes("补全"));
});

test("lighting presets have unique ids, labels and prompts", () => {
    for (const options of [LIGHTING_DIRECTIONS, LIGHTING_COLORS, LIGHTING_INTENSITIES]) {
        const ids = options.map((option) => option.id);
        assert.equal(new Set(ids).size, ids.length, "option ids must be unique");
        for (const option of options) {
            assert.ok(option.label.length > 0 && option.prompt.length > 0, `${option.id} needs label and prompt`);
        }
    }
});

test("buildLightingPrompt combines direction, color and intensity", () => {
    const prompt = buildLightingPrompt({ direction: "backlight", color: "warm", intensity: "soft" });
    assert.ok(prompt.includes("逆光"));
    assert.ok(prompt.includes("暖色调"));
    assert.ok(prompt.includes("柔和"));
    assert.ok(prompt.includes("参考图"));
});

test("buildLightingPrompt returns empty string when nothing is selected", () => {
    assert.equal(buildLightingPrompt({}), "");
    assert.equal(buildLightingPrompt({ direction: "unknown" }), "");
    assert.equal(buildLightingPrompt(null), "");
    assert.equal(buildLightingPrompt(undefined), "");
});

test("buildLightingPrompt works with partial settings and appends base prompt", () => {
    const prompt = buildLightingPrompt({ intensity: "strong" }, "棚拍人像");
    assert.ok(prompt.includes("强烈"));
    assert.ok(prompt.endsWith("原画面描述：棚拍人像"));
});
