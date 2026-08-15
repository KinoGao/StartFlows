import assert from "node:assert/strict";
import { test } from "vitest";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "../types";
import { buildGroupExecutionPlan, collectGroupMemberIds, isGroupExecutableNode } from "./canvas-group-execution";

function makeNode(id: string, type: CanvasNodeType, metadata: CanvasNodeMetadata = {}): CanvasNodeData {
    return { id, type, title: id, position: { x: 0, y: 0 }, width: 100, height: 100, metadata };
}

function connect(fromNodeId: string, toNodeId: string): CanvasConnection {
    return { id: `${fromNodeId}->${toNodeId}`, fromNodeId, toNodeId };
}

test("collectGroupMemberIds：起点是打组节点时返回 groupChildIds，并过滤不存在的节点", () => {
    const nodes = [makeNode("group", CanvasNodeType.Group, { groupChildIds: ["a", "b", "gone"] }), makeNode("a", CanvasNodeType.Text), makeNode("b", CanvasNodeType.Image)];
    assert.deepEqual(collectGroupMemberIds(nodes, [], "group"), ["a", "b"]);
});

test("collectGroupMemberIds：起点是组内子节点时返回所属分组的成员", () => {
    const nodes = [makeNode("group", CanvasNodeType.Group, { groupChildIds: ["a", "b"] }), makeNode("a", CanvasNodeType.Text), makeNode("b", CanvasNodeType.Image), makeNode("c", CanvasNodeType.Text)];
    assert.deepEqual(collectGroupMemberIds(nodes, [], "b"), ["a", "b"]);
});

test("collectGroupMemberIds：未打组时沿连线收集相连通的整组节点", () => {
    const nodes = [makeNode("a", CanvasNodeType.Text), makeNode("b", CanvasNodeType.Image), makeNode("c", CanvasNodeType.Video), makeNode("d", CanvasNodeType.Text)];
    const connections = [connect("a", "b"), connect("b", "c")];
    assert.deepEqual(collectGroupMemberIds(nodes, connections, "b"), ["a", "b", "c"]);
    assert.deepEqual(collectGroupMemberIds(nodes, connections, "d"), ["d"]);
});

test("isGroupExecutableNode：按节点类型与生成信息判断是否可执行", () => {
    assert.equal(isGroupExecutableNode(makeNode("t1", CanvasNodeType.Text, { content: "手写文本" }), false), false);
    assert.equal(isGroupExecutableNode(makeNode("t2", CanvasNodeType.Text, { prompt: "写一段文案" }), false), true);
    assert.equal(isGroupExecutableNode(makeNode("i1", CanvasNodeType.Image, { content: "data:image/png;base64,x" }), false), false);
    assert.equal(isGroupExecutableNode(makeNode("i2", CanvasNodeType.Image, { prompt: "一只猫" }), false), true);
    assert.equal(isGroupExecutableNode(makeNode("i3", CanvasNodeType.Image, { generationType: "edit" }), false), true);
    assert.equal(isGroupExecutableNode(makeNode("i4", CanvasNodeType.Image), true), true);
    assert.equal(isGroupExecutableNode(makeNode("v1", CanvasNodeType.Video), true), true);
    assert.equal(isGroupExecutableNode(makeNode("a1", CanvasNodeType.Audio), false), false);
    assert.equal(isGroupExecutableNode(makeNode("c1", CanvasNodeType.ComfyUI), false), true);
    assert.equal(isGroupExecutableNode(makeNode("g1", CanvasNodeType.Group), false), false);
    assert.equal(isGroupExecutableNode(makeNode("cfg", CanvasNodeType.Config), false), false);
});

test("buildGroupExecutionPlan：链式依赖按拓扑序分层，依赖可穿过不可执行的中间节点", () => {
    const nodes = [
        makeNode("text", CanvasNodeType.Text, { content: "手写提示词" }),
        makeNode("image", CanvasNodeType.Image, { prompt: "生成图" }),
        makeNode("video", CanvasNodeType.Video, { prompt: "图生视频" }),
    ];
    const connections = [connect("text", "image"), connect("image", "video")];
    const plan = buildGroupExecutionPlan(nodes, connections, ["text", "image", "video"]);
    assert.deepEqual(plan.levels, [["image"], ["video"]]);
    assert.deepEqual([...(plan.dependencies.get("video") || [])], ["image"]);
});

test("buildGroupExecutionPlan：互不依赖的节点同层并发，汇聚节点等待全部上游", () => {
    const nodes = [
        makeNode("i1", CanvasNodeType.Image, { prompt: "图一" }),
        makeNode("i2", CanvasNodeType.Image, { prompt: "图二" }),
        makeNode("video", CanvasNodeType.Video, { prompt: "合成视频" }),
    ];
    const connections = [connect("i1", "video"), connect("i2", "video")];
    const plan = buildGroupExecutionPlan(nodes, connections, ["i1", "i2", "video"]);
    assert.deepEqual(plan.levels, [["i1", "i2"], ["video"]]);
    assert.deepEqual([...(plan.dependencies.get("video") || [])].sort(), ["i1", "i2"]);
});

test("buildGroupExecutionPlan：无可执行节点时返回空计划；成环时剩余节点兜底为最后一层", () => {
    const textOnly = [makeNode("t", CanvasNodeType.Text, { content: "手写文本" })];
    assert.deepEqual(buildGroupExecutionPlan(textOnly, [], ["t"]).levels, []);

    const nodes = [makeNode("a", CanvasNodeType.Image, { prompt: "A" }), makeNode("b", CanvasNodeType.Image, { prompt: "B" })];
    const connections = [connect("a", "b"), connect("b", "a")];
    const plan = buildGroupExecutionPlan(nodes, connections, ["a", "b"]);
    assert.deepEqual(plan.levels, [["a", "b"]]);
});
