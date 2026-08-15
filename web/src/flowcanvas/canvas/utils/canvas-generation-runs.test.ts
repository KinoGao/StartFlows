import { describe, expect, it } from "vitest";

import { CanvasNodeType, type CanvasNodeData } from "../types";
import { generationRunSettlementKey, settleFinishedGenerationRuns } from "./canvas-generation-runs";

function generationNode(status: "loading" | "success" | "error"): CanvasNodeData {
    return {
        id: "node-1",
        type: CanvasNodeType.Image,
        title: "图片节点 1",
        position: { x: 0, y: 0 },
        width: 320,
        height: 180,
        metadata: {
            status,
            errorDetails: status === "error" ? "上游失败" : undefined,
            generationRuns: [{ id: "run-1", status: "running", startedAt: 1, updatedAt: 1 }],
        },
    };
}

describe("generation run settlement", () => {
    it("生成中节点不触发结算", () => {
        const nodes = [generationNode("loading")];

        expect(generationRunSettlementKey(nodes)).toBe("");
        expect(settleFinishedGenerationRuns(nodes)).toBe(nodes);
    });

    it("成功节点只在进入终态后结算", () => {
        const nodes = [generationNode("success")];
        const settled = settleFinishedGenerationRuns(nodes);

        expect(generationRunSettlementKey(nodes)).toContain("node-1:run-1:success");
        expect(settled).not.toBe(nodes);
        expect(settled[0].metadata?.generationRuns?.[0].status).toBe("succeeded");
    });

    it("失败节点保留错误详情", () => {
        const settled = settleFinishedGenerationRuns([generationNode("error")]);

        expect(settled[0].metadata?.generationRuns?.[0]).toMatchObject({
            status: "failed",
            errorDetails: "上游失败",
        });
    });
});
