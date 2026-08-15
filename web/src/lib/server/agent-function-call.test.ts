import { describe, expect, it, vi } from "vitest";

import { parseAgentPlanCall, parseReviewCall } from "./agent-function-call";

describe("Agent Function Call parsing refunds", () => {
    it("refunds malformed planning JSON", async () => {
        const refund = vi.fn().mockResolvedValue(undefined);

        await expect(parseAgentPlanCall({ arguments: "{" }, refund)).rejects.toBeInstanceOf(SyntaxError);
        expect(refund).toHaveBeenCalledTimes(1);
    });

    it("refunds a structurally invalid plan", async () => {
        const refund = vi.fn().mockResolvedValue(undefined);

        await expect(parseAgentPlanCall({ arguments: JSON.stringify({ objective: "", deliverables: [] }) }, refund)).rejects.toThrow("模型返回的创作计划无效");
        expect(refund).toHaveBeenCalledTimes(1);
    });

    it("does not refund a valid plan", async () => {
        const refund = vi.fn().mockResolvedValue(undefined);
        const plan = { objective: "制作商品主图", deliverables: [{ title: "主图", type: "image" as const, prompt: "生成商品主图" }] };

        await expect(parseAgentPlanCall({ arguments: JSON.stringify(plan), pointsCost: 2 }, refund)).resolves.toMatchObject({ ...plan, foundation: { brief: { objective: "制作商品主图" }, direction: { summary: expect.any(String) } } });
        expect(refund).not.toHaveBeenCalled();
    });

    it("refunds a plan that violates the explicitly selected media mode", async () => {
        const refund = vi.fn().mockResolvedValue(undefined);
        const plan = { objective: "制作商品视频", deliverables: [{ title: "误选主图", type: "image" as const, prompt: "生成商品主图" }] };

        await expect(parseAgentPlanCall({ arguments: JSON.stringify(plan) }, refund, undefined, { requiredGenerationMode: "video" })).rejects.toThrow("创作类型与用户选择不一致");
        expect(refund).toHaveBeenCalledTimes(1);
    });

    it("drops an invalid project handoff before validating an ordinary generation plan", async () => {
        const refund = vi.fn().mockResolvedValue(undefined);
        const plan = {
            objective: "制作森林女子角色设定图",
            deliverables: [{ title: "角色设定图", type: "image" as const, prompt: "生成森林女子角色设定图" }],
            projectHandoff: { surface: "canvas", title: "", ratio: "1:1", assetIds: [""] },
        };

        await expect(parseAgentPlanCall({ arguments: JSON.stringify(plan) }, refund, undefined, { allowProjectHandoff: false })).resolves.toMatchObject({
            objective: "制作森林女子角色设定图",
            projectHandoff: undefined,
            deliverables: plan.deliverables,
        });
        expect(refund).not.toHaveBeenCalled();
    });

    it("accepts a natural-language reply for a known conversation", async () => {
        const refund = vi.fn().mockResolvedValue(undefined);

        await expect(parseAgentPlanCall({ arguments: "在的，请告诉我你想聊什么。" }, refund, { objective: "你在吗？" })).resolves.toMatchObject({ intent: "conversation", objective: "你在吗？", reply: "在的，请告诉我你想聊什么。", deliverables: [] });
        expect(refund).not.toHaveBeenCalled();
    });

    it("cleans generation fields from a known conversation plan", async () => {
        const refund = vi.fn().mockResolvedValue(undefined);
        const raw = { intent: "generation", objective: "错误目标", reply: "在的。", deliverables: [{ title: "误带任务", type: "image", prompt: "忽略" }], projectHandoff: { surface: "canvas", title: "忽略" } };

        await expect(parseAgentPlanCall({ arguments: JSON.stringify(raw) }, refund, { objective: "你在吗？" })).resolves.toMatchObject({
            intent: "conversation",
            objective: "你在吗？",
            reply: "在的。",
            decisions: [],
            deliverables: [],
            projectHandoff: undefined,
        });
        expect(refund).not.toHaveBeenCalled();
    });

    it("refunds malformed review JSON and skips review retries", async () => {
        const refund = vi.fn().mockResolvedValue(undefined);

        await expect(parseReviewCall({ arguments: "not-json", pointsCost: 1 }, new Set(["image"]), refund)).resolves.toBeNull();
        expect(refund).toHaveBeenCalledTimes(1);
    });

    it("keeps only valid review task IDs without refunding", async () => {
        const refund = vi.fn().mockResolvedValue(undefined);
        const call = {
            arguments: JSON.stringify({ mode: "visual", status: "needs_revision", score: 68, retryTaskIds: ["image", "unknown", 1], summary: "重做主图", issues: [{ taskId: "image", category: "主体", severity: "high", message: "商品颜色偏离" }] }),
        };

        await expect(parseReviewCall(call, new Set(["image", "copy"]), refund)).resolves.toMatchObject({ mode: "visual", status: "needs_revision", score: 68, retryTaskIds: ["image"], issues: [{ taskId: "image", category: "主体" }] });
        expect(refund).not.toHaveBeenCalled();
    });
});
