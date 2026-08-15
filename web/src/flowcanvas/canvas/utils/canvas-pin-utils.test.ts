import assert from "node:assert/strict";
import { test } from "vitest";

import {
    PIN_COLORS,
    getPinColor,
    getPinColorLabel,
    getPinColorValue,
    isValidPinColor,
    setPinColor,
} from "./canvas-pin-utils";

test("PIN_COLORS 提供 TapNow 风格标记色板：id 唯一、色值合法、label 非空", () => {
    const ids = new Set<string>();
    for (const def of PIN_COLORS) {
        assert.equal(typeof def.id, "string");
        assert.equal(typeof def.label, "string");
        assert.ok(def.label.length > 0, `label 不应为空: ${def.id}`);
        assert.match(def.color, /^#[0-9a-fA-F]{6}$/, `色值应为 hex: ${def.id}`);
        assert.ok(!ids.has(def.id), `id 重复: ${def.id}`);
        ids.add(def.id);
    }
    assert.ok(PIN_COLORS.length >= 5, "色板至少 5 色");
});

test("isValidPinColor：仅接受色板内 id，拒绝非法值与 undefined", () => {
    assert.equal(isValidPinColor("red"), true);
    assert.equal(isValidPinColor("blue"), true);
    assert.equal(isValidPinColor("not-a-color"), false);
    assert.equal(isValidPinColor(""), false);
    assert.equal(isValidPinColor(undefined), false);
});

test("getPinColor：读取节点 pinColor，非法或缺失时返回 undefined", () => {
    assert.equal(getPinColor({ pinColor: "green" }), "green");
    assert.equal(getPinColor({ pinColor: "oops" }), undefined);
    assert.equal(getPinColor({}), undefined);
    assert.equal(getPinColor({ pinColor: undefined }), undefined);
});

test("getPinColorValue：id → 色值；未知 id 返回 undefined", () => {
    const red = PIN_COLORS.find((p) => p.id === "red");
    assert.equal(getPinColorValue("red"), red?.color);
    assert.equal(getPinColorValue("unknown"), undefined);
    assert.equal(getPinColorValue(undefined), undefined);
});

test("getPinColorLabel：id → 中文标签；未知 id 返回 undefined", () => {
    assert.equal(getPinColorLabel("red"), "红");
    assert.equal(getPinColorLabel("unknown"), undefined);
    assert.equal(getPinColorLabel(undefined), undefined);
});

test("setPinColor：合法 id 写入新副本，非法值不改动", () => {
    const node = { pinColor: "blue" };
    const next = setPinColor(node, "red");
    assert.equal(next.pinColor, "red");
    assert.notEqual(next, node, "应返回新对象（不可变）");

    const unchanged = setPinColor(node, "not-a-color");
    assert.equal(unchanged.pinColor, "blue");
    assert.equal(unchanged, node, "非法值应原样返回");
});
