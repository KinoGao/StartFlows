import assert from "node:assert/strict";
import { test } from "vitest";

import { computeTidyLayout } from "./canvas-tidy";

test("computeTidyLayout keeps reading order and returns a grid", () => {
    const layout = computeTidyLayout([
        { id: "b", position: { x: 900, y: 0 }, width: 200, height: 100 },
        { id: "a", position: { x: 100, y: 10 }, width: 200, height: 100 },
        { id: "c", position: { x: 50, y: 500 }, width: 400, height: 300 },
    ]);

    // 100x100 单元 + 96 间距 → cellWidth = 496；两个上行节点按 x 排序，c 独占第二行
    assert.deepEqual(layout.get("a"), { x: 50, y: 0 });
    assert.deepEqual(layout.get("b"), { x: 50 + 496, y: 0 });
    assert.deepEqual(layout.get("c"), { x: 50, y: 100 + 96 });
});

test("computeTidyLayout handles empty and single node", () => {
    assert.equal(computeTidyLayout([]).size, 0);
    const layout = computeTidyLayout([{ id: "only", position: { x: -200, y: 300 }, width: 100, height: 100 }]);
    assert.deepEqual(layout.get("only"), { x: -200, y: 300 });
});
