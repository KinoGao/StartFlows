import assert from "node:assert/strict";
import { test } from "vitest";

import { useCanvasAgentStore, type PipelineInfo } from "../stores/use-canvas-agent-store";
import { shouldResetPipeline, shouldSendPipelineId } from "./canvas-local-agent-panel";

const fakePipeline: PipelineInfo = {
    id: "p-1",
    mode: "script",
    currentStage: "stage-1",
    stages: [],
    status: "running",
};

test("default 模式切回时必须重置 pipeline 状态（回归：残留污染自由创作对话）", () => {
    assert.equal(shouldResetPipeline("default"), true);
    assert.equal(shouldResetPipeline("script"), false);
    assert.equal(shouldResetPipeline("production"), false);
});

test("sendPrompt 只在非 default 模式携带 pipelineId（回归：default 模式绝不上送）", () => {
    assert.equal(shouldSendPipelineId("default"), false);
    assert.equal(shouldSendPipelineId("script"), true);
    assert.equal(shouldSendPipelineId("production"), true);
});

test("完整生命周期：script 创建 pipeline 后切回 default，store 中 pipeline 状态必须清空", () => {
    const store = useCanvasAgentStore;
    // 模拟进入 script 模式并创建 pipeline（createPipeline 成功后的 store 状态）
    store.getState().setAgentState({ agentMode: "script", pipelineId: "p-1", pipeline: fakePipeline });
    assert.equal(store.getState().pipelineId, "p-1");

    // 模拟组件 onModeChange 的修复后语义：default 模式需重置 pipeline
    if (shouldResetPipeline("default")) {
        store.getState().setAgentState({ agentMode: "default", pipelineId: null, pipeline: null });
    }

    const after = store.getState();
    assert.equal(after.agentMode, "default");
    assert.equal(after.pipelineId, null);
    assert.equal(after.pipeline, null);

    // 发送决策：default 模式必须不上送 pipelineId
    const bodyPipelineId = shouldSendPipelineId(after.agentMode) ? after.pipelineId || undefined : undefined;
    assert.equal(bodyPipelineId, undefined);
});
