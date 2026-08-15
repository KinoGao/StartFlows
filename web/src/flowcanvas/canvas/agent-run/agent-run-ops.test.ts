import assert from "node:assert/strict";
import { test } from "vitest";

import type { CanvasAgentSnapshot } from "../utils/canvas-agent-ops";
import { CanvasNodeType } from "../types";
import { buildAgentRunPrompt, compileAgentRunOps } from "./agent-run-ops";
import type { AgentRun, AgentRunPlan } from "./agent-run-types";

const MODELS = { textModel: "text-model", imageModel: "image-model", videoModel: "video-model", audioModel: "audio-model" };

function makeSnapshot(): CanvasAgentSnapshot {
    return {
        projectId: "p1",
        title: "测试画布",
        nodes: [
            { id: "existing-1", type: CanvasNodeType.Text, title: "已有文本", position: { x: 0, y: 100 }, width: 384, height: 216, metadata: { content: "旧内容" } },
        ],
        connections: [],
        selectedNodeIds: [],
        viewport: { x: 0, y: 0, k: 1 },
    };
}

function makeRun(): AgentRun {
    return { id: "run1", projectId: "p1", title: "测试", requirement: "做一个品牌视觉", status: "planned", tasks: [], createdAt: 1, updatedAt: 1 };
}

function makePlan(): AgentRunPlan {
    return {
        intent: "generation",
        reply: "已规划",
        foundation: {
            brief: { objective: "品牌视觉", audience: "年轻用户", coreMessage: "新品", constraints: [] },
            direction: { summary: "极简科技", style: "极简", composition: "居中", colors: ["蓝"], lighting: "柔光", keywords: [], avoid: [] },
        },
        deliverables: [
            { id: "d1", title: "主视觉", type: "image", prompt: "一张主视觉海报", count: 2, dependencies: [] },
            { id: "d2", title: "宣传片", type: "video", prompt: "海报延展视频", dependencies: ["d1"] },
        ],
    };
}

test("compileAgentRunOps builds brief/direction nodes plus task nodes in deterministic columns", () => {
    const { ops, tasks } = compileAgentRunOps(makeRun(), makePlan(), makeSnapshot(), MODELS);
    const added = ops.filter((op) => op.type === "add_node");

    assert.equal(added.length, 4);
    assert.deepEqual(
        added.map((op) => op.id),
        ["agentrun-run1-brief", "agentrun-run1-direction", "agentrun-run1-d1", "agentrun-run1-d2"],
    );
    // 简报/视觉方向列在任务列左侧，且都在已有内容右侧
    const brief = added[0];
    const task = added[2];
    assert.ok(brief.position && task.position && brief.position.x < task.position.x);
    assert.ok(brief.position && brief.position.x > 384);
    assert.equal(tasks.length, 2);
    assert.equal(tasks[0].nodeId, "agentrun-run1-d1");
    assert.equal(tasks[0].status, "ready");
});

test("compileAgentRunOps connects dependencies to upstream task nodes", () => {
    const { ops } = compileAgentRunOps(makeRun(), makePlan(), makeSnapshot(), MODELS);
    const connections = ops.filter((op) => op.type === "connect_nodes");

    assert.ok(connections.some((op) => op.type === "connect_nodes" && op.fromNodeId === "agentrun-run1-d1" && op.toNodeId === "agentrun-run1-d2"));
    assert.ok(connections.some((op) => op.type === "connect_nodes" && op.fromNodeId === "agentrun-run1-brief" && op.toNodeId === "agentrun-run1-d1"));
});

test("compileAgentRunOps injects foundation into prompts and targetNodeId produces update op", () => {
    const plan = makePlan();
    plan.deliverables[0] = { ...plan.deliverables[0], targetNodeId: "existing-1" };
    const { ops, tasks } = compileAgentRunOps(makeRun(), plan, makeSnapshot(), MODELS);
    const update = ops.find((op) => op.type === "update_node" && op.id === "existing-1");

    assert.ok(update);
    assert.equal(tasks[0].nodeId, "existing-1");
    const prompt = update?.type === "update_node" ? update.metadata?.prompt : "";
    assert.ok(prompt?.includes("品牌视觉"));
    assert.ok(prompt?.includes("极简科技"));
    assert.ok(prompt?.includes("一张主视觉海报"));
});

test("buildAgentRunPrompt works without foundation", () => {
    const prompt = buildAgentRunPrompt({ id: "d1", title: "t", type: "image", prompt: "一只猫", dependencies: [] });
    assert.equal(prompt, "一只猫");
});
