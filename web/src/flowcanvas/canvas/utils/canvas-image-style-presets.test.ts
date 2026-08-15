import assert from "node:assert/strict";
import { test } from "vitest";

import {
    CUSTOM_IMAGE_STYLE_PREFIX,
    IMAGE_STYLE_CATEGORY_TABS,
    IMAGE_STYLE_PRESETS,
    customImageStyleId,
    customStyleToPreset,
    filterImageStylePresets,
    imageStylePresetPrompt,
    resolveImageStylePreset,
    type ImageStyleCategory,
} from "./canvas-image-style-presets";
import type { CustomImageStyle } from "@/flowcanvas/stores/use-config-store";

const CATEGORIES: ImageStyleCategory[] = ["photo", "ecommerce", "anime", "illustration", "render3d", "art"];

test("IMAGE_STYLE_PRESETS 覆盖 6 个分类，每类 4-8 项，id 唯一", () => {
    const ids = IMAGE_STYLE_PRESETS.map((preset) => preset.id);
    assert.equal(new Set(ids).size, ids.length, "preset ids must be unique");
    assert.equal(IMAGE_STYLE_PRESETS[0].id, "", "first preset must be 自动风格");
    for (const category of CATEGORIES) {
        const count = IMAGE_STYLE_PRESETS.filter((preset) => preset.category === category).length;
        assert.ok(count >= 4 && count <= 8, `category ${category} should have 4-8 presets, got ${count}`);
    }
    for (const preset of IMAGE_STYLE_PRESETS.filter((item) => item.id)) {
        assert.ok(preset.label.length > 0 && preset.shortLabel.length > 0, `${preset.id} needs labels`);
        assert.ok(preset.description.length > 0, `${preset.id} needs a description`);
        assert.ok(/^[a-z0-9,'\-\s]+$/i.test(preset.prompt), `${preset.id} prompt should be English keywords`);
    }
    const tabIds = IMAGE_STYLE_CATEGORY_TABS.map((tab) => tab.id);
    assert.deepEqual(tabIds, ["all", ...CATEGORIES, "custom"]);
});

test("filterImageStylePresets 按分类过滤，all 返回全部", () => {
    assert.equal(filterImageStylePresets(IMAGE_STYLE_PRESETS, "all", "").length, IMAGE_STYLE_PRESETS.length);
    const photo = filterImageStylePresets(IMAGE_STYLE_PRESETS, "photo", "");
    assert.ok(photo.length >= 4);
    assert.ok(photo.every((preset) => preset.category === "photo"));
    assert.equal(filterImageStylePresets(IMAGE_STYLE_PRESETS, "custom", "").length, 0);
});

test("filterImageStylePresets 关键词跨分类搜索，匹配中文名与英文提示词", () => {
    const byLabel = filterImageStylePresets(IMAGE_STYLE_PRESETS, "photo", "赛博朋克");
    assert.equal(byLabel.length, 1);
    assert.equal(byLabel[0].id, "cyberpunk");
    const byPrompt = filterImageStylePresets(IMAGE_STYLE_PRESETS, "all", "WATERCOLOR");
    assert.ok(byPrompt.some((preset) => preset.id === "ghibli-watercolor"));
    assert.ok(byPrompt.some((preset) => preset.id === "watercolor-illustration"));
    assert.equal(filterImageStylePresets(IMAGE_STYLE_PRESETS, "all", "不存在的风格").length, 0);
    // 关键词含首尾空格时按 trim 后处理
    assert.deepEqual(filterImageStylePresets(IMAGE_STYLE_PRESETS, "all", "  "), filterImageStylePresets(IMAGE_STYLE_PRESETS, "all", ""));
});

const CUSTOM_STYLES: CustomImageStyle[] = [{ id: "abc123", name: "我的赛博", prompt: "my custom neon style, dramatic glow", createdAt: "2026-01-01T00:00:00.000Z" }];

test("customStyleToPreset 把自定义风格转换为卡片结构，id 加前缀", () => {
    const preset = customStyleToPreset(CUSTOM_STYLES[0]);
    assert.equal(preset.id, `${CUSTOM_IMAGE_STYLE_PREFIX}abc123`);
    assert.equal(preset.label, "我的赛博");
    assert.equal(preset.prompt, "my custom neon style, dramatic glow");
    assert.equal(preset.category, "custom");
    assert.ok(preset.tone.length > 0);
});

test("resolveImageStylePreset 支持内置、自定义与回退自动风格", () => {
    assert.equal(resolveImageStylePreset("cyberpunk").label, "赛博朋克");
    assert.equal(resolveImageStylePreset(customImageStyleId("abc123"), CUSTOM_STYLES).label, "我的赛博");
    assert.equal(resolveImageStylePreset("unknown-id", CUSTOM_STYLES).id, "");
    assert.equal(resolveImageStylePreset(customImageStyleId("missing"), CUSTOM_STYLES).id, "");
    assert.equal(resolveImageStylePreset(undefined).id, "");
});

test("imageStylePresetPrompt 返回风格提示词片段，空或未知 id 返回空串", () => {
    assert.equal(imageStylePresetPrompt("cyberpunk"), "cyberpunk cityscape, neon lights, rainy night, high contrast, futuristic atmosphere");
    assert.equal(imageStylePresetPrompt(customImageStyleId("abc123"), CUSTOM_STYLES), "my custom neon style, dramatic glow");
    assert.equal(imageStylePresetPrompt(""), "");
    assert.equal(imageStylePresetPrompt("unknown-id"), "");
});

test("自定义风格与内置 id 不冲突，且可参与分类筛选", () => {
    const customPresets = CUSTOM_STYLES.map(customStyleToPreset);
    const merged = [...IMAGE_STYLE_PRESETS, ...customPresets];
    assert.equal(new Set(merged.map((preset) => preset.id)).size, merged.length);
    assert.deepEqual(filterImageStylePresets(merged, "custom", ""), customPresets);
    assert.equal(filterImageStylePresets(merged, "all", "我的赛博")[0].id, customImageStyleId("abc123"));
});
