import assert from "node:assert/strict";
import { test } from "vitest";

import { moveCrop, resizeCrop, type CanvasCropRect } from "./canvas-crop-geometry";

const box = { width: 1600, height: 900 };
const squareBox = { width: 800, height: 800 };

function pixelSize(crop: CanvasCropRect, b: { width: number; height: number } = box) {
    return { width: crop.width * b.width, height: crop.height * b.height };
}

test("resizeCrop 拖 e 手柄越界时限制宽度而不是移动 x", () => {
    // 裁切框贴近右边缘，继续向右放大
    const crop = { x: 0.8, y: 0.5, width: 0.15, height: 0.3 };
    const next = resizeCrop(crop, 0.2, 0, "e", false, squareBox);
    assert.equal(next.x, 0.8, "e 手柄应保持左边缘不动");
    assert.ok(next.x + next.width <= 1 + 1e-9, "裁剪框不得越出右边界");
    assert.ok(Math.abs(next.width - 0.2) < 1e-9, "宽度应被限制在 1 - x");
});

test("resizeCrop 拖 w 手柄越界时保持右边缘不动", () => {
    const crop = { x: 0.1, y: 0.2, width: 0.5, height: 0.4 };
    const next = resizeCrop(crop, -0.2, 0, "w", false, squareBox);
    const right = crop.x + crop.width;
    assert.equal(next.x + next.width, right, "w 手柄应保持右边缘不动");
    assert.ok(next.x >= 0, "裁剪框不得越出左边界");
});

test("resizeCrop 锁定比例时保持像素宽高比（16:9 图拖 e）", () => {
    const crop = { x: 0.12, y: 0.12, width: 0.76, height: 0.76 };
    const before = pixelSize(crop);
    const aspect = before.width / before.height;
    const next = resizeCrop(crop, 0.1, 0, "e", true, box);
    const after = pixelSize(next);
    assert.ok(Math.abs(after.width / after.height - aspect) < 1e-6, "锁定比例后宽高比应保持不变");
    assert.equal(next.x, 0.12, "e 手柄应保持左边缘不动");
    assert.ok(next.y + next.height <= 1, "高度不得越出下边界");
});

test("resizeCrop 锁定比例时拖 s 手柄宽度按比例跟随", () => {
    const crop = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };
    const aspect = (crop.width * box.width) / (crop.height * box.height);
    const next = resizeCrop(crop, 0, 0.2, "s", true, box);
    const after = pixelSize(next);
    assert.ok(Math.abs(after.width / after.height - aspect) < 1e-6);
    assert.equal(next.y, 0.1, "s 手柄应保持上边缘不动");
});

test("resizeCrop 锁定比例时拖 w/n 手柄保持右/下边缘不动", () => {
    const crop = { x: 0.3, y: 0.3, width: 0.5, height: 0.4 };
    const right = crop.x + crop.width;
    const bottom = crop.y + crop.height;
    const next = resizeCrop(crop, -0.1, -0.1, "nw", true, box);
    assert.ok(Math.abs(next.x + next.width - right) < 1e-9, "nw 手柄应保持右边缘不动");
    assert.ok(Math.abs(next.y + next.height - bottom) < 1e-9, "nw 手柄应保持下边缘不动");
    const after = pixelSize(next);
    const aspect = (crop.width * box.width) / (crop.height * box.height);
    assert.ok(Math.abs(after.width / after.height - aspect) < 1e-6, "锁定比例应保持");
});

test("resizeCrop 最小尺寸限制", () => {
    const crop = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };
    const next = resizeCrop(crop, -0.9, -0.9, "se", false, squareBox);
    assert.equal(next.width, 0.06, "宽度不得小于最小尺寸");
    assert.equal(next.height, 0.06, "高度不得小于最小尺寸");
});

test("moveCrop 平移越界时夹紧在边界内", () => {
    const crop = { x: 0.5, y: 0.5, width: 0.2, height: 0.2 };
    const next = moveCrop(crop, 10, -10);
    assert.equal(next.x, 0.8, "x 不得越过 1 - width");
    assert.equal(next.y, 0, "y 不得小于 0");
});
