export type CanvasAgentStableStageKey = "planning" | "skills" | "plan" | "executing" | "reviewing" | "finalizing" | "paused";
export type CanvasAgentRunStageKey = CanvasAgentStableStageKey | "reconnecting";

export type CanvasAgentRunStage = {
    key: CanvasAgentRunStageKey;
    text: string;
    resumeKey?: CanvasAgentStableStageKey;
};

export type CanvasAgentProgressStep = {
    key: "canvas" | "skills" | "plan" | "execute" | "review" | "deliver";
    label: string;
    status: "pending" | "running" | "completed" | "paused";
};

const definitions: Array<Pick<CanvasAgentProgressStep, "key" | "label">> = [
    { key: "canvas", label: "理解当前需求" },
    { key: "skills", label: "检查素材与能力" },
    { key: "plan", label: "准备执行任务" },
    { key: "execute", label: "执行生成任务" },
    { key: "review", label: "检查生成结果" },
    { key: "deliver", label: "整理生成结果" },
];

export function canvasAgentProgressSteps(stage: CanvasAgentRunStage): CanvasAgentProgressStep[] {
    const activeKey = stage.key === "reconnecting" ? stage.resumeKey || "planning" : stage.key;
    const activeIndex = activeKey === "planning" ? 0 : activeKey === "skills" ? 1 : activeKey === "plan" ? 2 : activeKey === "executing" || activeKey === "paused" ? 3 : activeKey === "reviewing" ? 4 : 5;
    return definitions.map((step, index) => ({
        ...step,
        status: index < activeIndex ? "completed" : index > activeIndex ? "pending" : activeKey === "paused" ? "paused" : "running",
    }));
}
