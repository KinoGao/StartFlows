import assert from "node:assert/strict";
import { test } from "vitest";

import type { CanvasNodeType } from "../types";
import { applyCanvasAgentOps, type CanvasAgentOp } from "./canvas-agent-ops";
import type { CanvasAgentSnapshot } from "./canvas-agent-ops";

function emptySnapshot(): CanvasAgentSnapshot {
    return { projectId: "test", title: "测试", nodes: [], connections: [], selectedNodeIds: [], viewport: { x: 0, y: 0, k: 1 } };
}

test("未指定坐标的多个 add_node 自动横向流式排列不重叠", () => {
    const ops: CanvasAgentOp[] = [
        { type: "add_node", nodeType: "text" as CanvasNodeType, metadata: { content: "一" } },
        { type: "add_node", nodeType: "text" as CanvasNodeType, metadata: { content: "二" } },
        { type: "add_node", nodeType: "text" as CanvasNodeType, metadata: { content: "三" } },
    ];
    const result = applyCanvasAgentOps(emptySnapshot(), ops);
    assert.equal(result.nodes.length, 3);
    const xs = result.nodes.map((node) => node.position.x);
    const ys = result.nodes.map((node) => node.position.y);
    // 依次往右排，x 严格递增且间距 ≥ 40
    assert.ok(xs[1] > xs[0] && xs[2] > xs[1]);
    assert.ok(xs[1] - xs[0] >= 40 && xs[2] - xs[1] >= 40);
    // 同一行 y 对齐
    assert.equal(ys[0], ys[1]);
    assert.equal(ys[1], ys[2]);
    // 不重叠：每个节点 x 起点大于前一个的右边缘
    const rightEdge = (i: number) => result.nodes[i].position.x + (result.nodes[i].width || 0);
    assert.ok(result.nodes[1].position.x >= rightEdge(0));
    assert.ok(result.nodes[2].position.x >= rightEdge(1));
});

test("已有节点时未指定坐标的 add_node 排到最右侧", () => {
    const snapshot = emptySnapshot();
    const seed: CanvasAgentOp[] = [{ type: "add_node", nodeType: "text" as CanvasNodeType, position: { x: 500, y: 300 }, metadata: { content: "已有" } }];
    const seeded = applyCanvasAgentOps(snapshot, seed);
    const result = applyCanvasAgentOps(seeded, [{ type: "add_node", nodeType: "text" as CanvasNodeType, metadata: { content: "新" } }]);
    const existing = result.nodes.find((node) => node.metadata?.content === "已有")!;
    const added = result.nodes.find((node) => node.metadata?.content === "新")!;
    assert.ok(added.position.x >= existing.position.x + (existing.width || 0) + 40);
    assert.equal(added.position.y, existing.position.y);
});

test("显式指定坐标的 add_node 保持原位置", () => {
    const result = applyCanvasAgentOps(emptySnapshot(), [{ type: "add_node", nodeType: "text" as CanvasNodeType, position: { x: 123, y: 456 } }]);
    assert.equal(result.nodes[0].position.x, 123);
    assert.equal(result.nodes[0].position.y, 456);
});
