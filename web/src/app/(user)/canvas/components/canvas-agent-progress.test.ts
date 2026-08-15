import { describe, expect, it } from "vitest";

import { canvasAgentProgressSteps } from "./canvas-agent-progress";

describe("Canvas Agent progress", () => {
    it("maps backend stages to an honest visible workflow", () => {
        expect(canvasAgentProgressSteps({ key: "planning", text: "正在分析" }).map((step) => step.status)).toEqual(["running", "pending", "pending", "pending", "pending", "pending"]);
        expect(canvasAgentProgressSteps({ key: "plan", text: "计划已生成" }).map((step) => step.status)).toEqual(["completed", "completed", "running", "pending", "pending", "pending"]);
        expect(canvasAgentProgressSteps({ key: "executing", text: "正在执行" }).map((step) => step.status)).toEqual(["completed", "completed", "completed", "running", "pending", "pending"]);
        expect(canvasAgentProgressSteps({ key: "finalizing", text: "正在整理" }).at(-1)?.status).toBe("running");
    });

    it("shows a paused task without pretending execution completed", () => {
        const steps = canvasAgentProgressSteps({ key: "paused", text: "任务已暂停" });
        expect(steps[3]).toMatchObject({ key: "execute", status: "paused" });
        expect(steps[4].status).toBe("pending");
    });

    it("keeps the last real phase visible while reconnecting", () => {
        expect(canvasAgentProgressSteps({ key: "reconnecting", resumeKey: "reviewing", text: "正在恢复连接" }).map((step) => step.status)).toEqual(["completed", "completed", "completed", "completed", "running", "pending"]);
    });
});
