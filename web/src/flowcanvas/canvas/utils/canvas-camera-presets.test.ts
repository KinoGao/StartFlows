import assert from "node:assert/strict";
import { test } from "vitest";

import {
    CAMERA_APERTURES,
    CAMERA_BODY_OPTIONS,
    CAMERA_FOCAL_LENGTHS,
    CAMERA_LENS_OPTIONS,
    CANVAS_VIDEO_CAMERA_PRESETS,
    buildImageCameraPrompt,
    imageCameraSummaryLabel,
    videoCameraPresetPrompt,
} from "./canvas-camera-presets";

test("CANVAS_VIDEO_CAMERA_PRESETS 提供 20+ 运镜预设且 id 唯一", () => {
    const selectable = CANVAS_VIDEO_CAMERA_PRESETS.filter((preset) => preset.id);
    assert.ok(selectable.length >= 20, `expected 20+ camera moves, got ${selectable.length}`);
    const ids = CANVAS_VIDEO_CAMERA_PRESETS.map((preset) => preset.id);
    assert.equal(new Set(ids).size, ids.length, "preset ids must be unique");
    for (const preset of selectable) {
        assert.ok(preset.label.length > 0 && preset.shortLabel.length > 0, `${preset.id} needs labels`);
        assert.ok(preset.description.length > 0, `${preset.id} needs a description`);
        assert.ok(/^[a-z0-9,'\-\s]+$/i.test(preset.prompt), `${preset.id} prompt should be English keywords`);
    }
    assert.equal(CANVAS_VIDEO_CAMERA_PRESETS[0].id, "", "first preset must be 自动运镜");
});

test("videoCameraPresetPrompt 返回对应运镜提示词，未知或空 id 返回空串", () => {
    assert.equal(videoCameraPresetPrompt("dolly-in"), "smooth dolly in toward the subject");
    assert.equal(videoCameraPresetPrompt(""), "");
    assert.equal(videoCameraPresetPrompt(undefined), "");
    assert.equal(videoCameraPresetPrompt("not-a-preset"), "");
});

test("摄像机控制选项清单完整且 prompt 非空", () => {
    for (const option of [...CAMERA_BODY_OPTIONS, ...CAMERA_LENS_OPTIONS]) {
        assert.ok(option.label.length > 0, "option needs a label");
        if (option.id) assert.ok(option.prompt.length > 0, `${option.id} needs a prompt`);
    }
    assert.ok(CAMERA_FOCAL_LENGTHS.filter(Boolean).length >= 7);
    assert.ok(CAMERA_APERTURES.filter(Boolean).length >= 8);
    assert.equal(CAMERA_BODY_OPTIONS[0].id, "", "first body option must be 不限");
    assert.equal(CAMERA_LENS_OPTIONS[0].id, "", "first lens option must be 不限");
});

test("buildImageCameraPrompt 空设置返回空串", () => {
    assert.equal(buildImageCameraPrompt(undefined), "");
    assert.equal(buildImageCameraPrompt(null), "");
    assert.equal(buildImageCameraPrompt({}), "");
    assert.equal(buildImageCameraPrompt({ body: "", lens: "", focalLength: "", aperture: "" }), "");
});

test("buildImageCameraPrompt 只拼装已选择的参数", () => {
    assert.equal(buildImageCameraPrompt({ aperture: "f/1.8" }), "f/1.8 aperture");
    assert.equal(buildImageCameraPrompt({ focalLength: "85", lens: "prime" }), "85mm prime lens");
    const full = buildImageCameraPrompt({ body: "35mm-film", lens: "prime", focalLength: "50", aperture: "f/2.8" });
    assert.equal(full, "shot on a 35mm film camera, 50mm prime lens, f/2.8 aperture");
    assert.equal(buildImageCameraPrompt({ body: "not-a-body", lens: "not-a-lens" }), "");
});

test("imageCameraSummaryLabel 汇总已选参数，未设置为「摄像机」", () => {
    assert.equal(imageCameraSummaryLabel(undefined), "摄像机");
    assert.equal(imageCameraSummaryLabel({}), "摄像机");
    assert.equal(imageCameraSummaryLabel({ focalLength: "50", aperture: "f/1.8" }), "50mm · f/1.8");
    assert.equal(imageCameraSummaryLabel({ body: "medium-format" }), "中画幅相机");
});
