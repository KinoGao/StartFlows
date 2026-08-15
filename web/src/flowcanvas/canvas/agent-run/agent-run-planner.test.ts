import assert from "node:assert/strict";
import { test } from "vitest";

import type { CanvasAgentSnapshot } from "../utils/canvas-agent-ops";
import { normalizeAgentRunPlan } from "./agent-run-planner";

const EMPTY_SNAPSHOT: CanvasAgentSnapshot = {
    projectId: "p1",
    title: "测试画布",
    nodes: [],
    connections: [],
    selectedNodeIds: [],
    viewport: { x: 0, y: 0, k: 1 },
};

test("normalizeAgentRunPlan returns conversation reply without deliverables", () => {
    const plan = normalizeAgentRunPlan({ intent: "conversation", reply: "这是一个回答", deliverables: [{ title: "x", type: "image", prompt: "y" }] }, EMPTY_SNAPSHOT);

    assert.equal(plan.intent, "conversation");
    assert.equal(plan.reply, "这是一个回答");
    assert.equal(plan.deliverables.length, 0);
});

test("normalizeAgentRunPlan keeps valid generation plan with foundation and dependencies", () => {
    const plan = normalizeAgentRunPlan(
        {
            intent: "generation",
            reply: "已规划",
            foundation: {
                brief: { objective: "品牌海报", audience: "年轻人", coreMessage: "新品上市", constraints: ["竖版"] },
                direction: { summary: "极简科技风", style: "极简", composition: "居中构图", colors: ["蓝", "白"], lighting: "柔光", keywords: ["干净"], avoid: ["杂乱"] },
            },
            deliverables: [
                { id: "d1", title: "主视觉", type: "image", prompt: "一张海报", count: 2 },
                { id: "d2", title: "宣传视频", type: "video", prompt: "海报动起来", dependencies: ["d1", "missing"] },
            ],
        },
        EMPTY_SNAPSHOT,
    );

    assert.equal(plan.deliverables.length, 2);
    assert.equal(plan.deliverables[0].count, 2);
    assert.deepEqual(plan.deliverables[1].dependencies, ["d1"]);
    assert.equal(plan.foundation?.direction.style, "极简");
});

test("normalizeAgentRunPlan drops unknown targetNodeId and breaks dependency cycles", () => {
    const plan = normalizeAgentRunPlan(
        {
            intent: "generation",
            reply: "已规划",
            deliverables: [
                { id: "d1", title: "A", type: "text", prompt: "a", targetNodeId: "ghost-node", dependencies: ["d2"] },
                { id: "d2", title: "B", type: "text", prompt: "b", dependencies: ["d1"] },
            ],
        },
        EMPTY_SNAPSHOT,
    );

    assert.equal(plan.deliverables[0].targetNodeId, undefined);
    // 环被打破后至少有一个节点的依赖被清掉
    assert.ok(plan.deliverables.some((item) => item.dependencies.length === 0));
});

test("normalizeAgentRunPlan throws for generation plan without deliverables", () => {
    assert.throws(() => normalizeAgentRunPlan({ intent: "generation", reply: "x", deliverables: [] }, EMPTY_SNAPSHOT));
});
