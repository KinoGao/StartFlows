import { describe, expect, it } from "vitest";

import { CanvasNodeType, type CanvasNodeData } from "../types";
import { hasCanvasGenerationTask, pauseCanvasGenerationReview, resumeCanvasGenerationReview } from "./canvas-generation-review";

const taskNode: CanvasNodeData = {
    id: "video-node",
    type: CanvasNodeType.Video,
    title: "视频任务",
    position: { x: 0, y: 0 },
    width: 320,
    height: 180,
    metadata: { status: "loading", videoTask: { id: "original-task", provider: "generation", model: "video-model" } },
};

describe("Canvas generation review state", () => {
    it("pauses automatic polling while preserving the original task identity", () => {
        const [paused] = pauseCanvasGenerationReview([taskNode], [taskNode.id], "创建结果待确认");

        expect(paused.metadata).toMatchObject({ status: "needs_review", errorDetails: "创建结果待确认", videoTask: { id: "original-task" } });
        expect(hasCanvasGenerationTask(paused)).toBe(true);
    });

    it("checks the same task by returning it to loading without replacing its id", () => {
        const [paused] = pauseCanvasGenerationReview([taskNode], [taskNode.id], "创建结果待确认");
        const [resumed] = resumeCanvasGenerationReview([paused], taskNode.id);

        expect(resumed.metadata).toMatchObject({ status: "loading", videoTask: { id: "original-task" } });
        expect(resumed.metadata?.errorDetails).toBeUndefined();
    });
});
