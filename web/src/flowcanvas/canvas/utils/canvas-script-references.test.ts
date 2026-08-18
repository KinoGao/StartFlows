import assert from "node:assert/strict";
import { test } from "vitest";

import { composeScriptBeatVideoReferenceIds, deriveScriptBeatVideoMode, resolveScriptBeatReferenceIds } from "./canvas-script-references";
import type { CanvasScriptAsset } from "../types";

const assets: CanvasScriptAsset[] = [
    { id: "asset-1", kind: "character", name: "林晚", description: "短发女性" },
    { id: "asset-2", kind: "scene", name: "控制室", description: "深夜冷光" },
];
const assetOutputs = { "asset-1": "img-a", "asset-2": "img-b" };
const allUsable = () => true;

test("resolveScriptBeatReferenceIds auto-derives character/scene asset images when unset", () => {
    const ids = resolveScriptBeatReferenceIds({ character: "林晚", scene: "控制室" }, assets, assetOutputs, allUsable);

    assert.deepEqual(ids, ["img-a", "img-b"]);
});

test("resolveScriptBeatReferenceIds skips assets without usable output and dedupes", () => {
    const ids = resolveScriptBeatReferenceIds({ character: "林晚", scene: "林晚" }, assets, assetOutputs, (id) => id !== "img-b");

    assert.deepEqual(ids, ["img-a"]);
    assert.deepEqual(resolveScriptBeatReferenceIds({}, assets, assetOutputs, allUsable), []);
});

test("resolveScriptBeatReferenceIds honors explicit selection, including explicit empty", () => {
    assert.deepEqual(resolveScriptBeatReferenceIds({ character: "林晚", referenceNodeIds: [] }, assets, assetOutputs, allUsable), []);
    assert.deepEqual(
        resolveScriptBeatReferenceIds({ character: "林晚", referenceNodeIds: ["img-c", "img-x"] }, assets, assetOutputs, (id) => id !== "img-x"),
        ["img-c"],
    );
});

test("deriveScriptBeatVideoMode maps reference count to generation mode", () => {
    assert.equal(deriveScriptBeatVideoMode(0), "text-to-video");
    assert.equal(deriveScriptBeatVideoMode(1), "image-to-video");
    assert.equal(deriveScriptBeatVideoMode(3), "image-reference");
});

test("composeScriptBeatVideoReferenceIds puts the storyboard frame first as the video first frame", () => {
    const ids = composeScriptBeatVideoReferenceIds("frame-1", { character: "林晚", scene: "控制室" }, assets, assetOutputs, allUsable);

    assert.deepEqual(ids, ["frame-1", "img-a", "img-b"]);
});

test("composeScriptBeatVideoReferenceIds tolerates missing/unusable frames and dedupes", () => {
    assert.deepEqual(composeScriptBeatVideoReferenceIds(undefined, { character: "林晚" }, assets, assetOutputs, allUsable), ["img-a"]);
    assert.deepEqual(composeScriptBeatVideoReferenceIds("img-a", { character: "林晚" }, assets, assetOutputs, allUsable), ["img-a"]);
    assert.deepEqual(composeScriptBeatVideoReferenceIds("gone", { character: "林晚" }, assets, assetOutputs, (id) => id !== "gone"), ["img-a"]);
});
