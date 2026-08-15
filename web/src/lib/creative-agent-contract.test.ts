import { describe, expect, it } from "vitest";

import { normalizeCreativeDeliverables, normalizeCreativeFoundation, normalizeCreativeReview, withCreativeFoundation } from "./creative-agent-contract";

describe("creative agent contract", () => {
    it("normalizes a compact creative foundation", () => {
        expect(
            normalizeCreativeFoundation(
                {
                    complexity: "complex",
                    brief: { objective: "新品发布", constraints: ["不要夸张", "不要夸张"] },
                    direction: { summary: "克制科技感", colors: ["冷白", "青绿"], keywords: Array.from({ length: 20 }, (_, index) => `词${index}`) },
                },
                "fallback",
            ),
        ).toMatchObject({ complexity: "complex", brief: { objective: "新品发布", constraints: ["不要夸张"] }, direction: { summary: "克制科技感", colors: ["冷白", "青绿"] } });
    });

    it("falls back to the current request and injects the same constraints once", () => {
        const foundation = normalizeCreativeFoundation({}, "制作主视觉");
        const prompt = withCreativeFoundation("生成图片", foundation);
        expect(prompt).toContain("目标：制作主视觉");
        expect(withCreativeFoundation(prompt, foundation)).toBe(prompt);
    });

    it("keeps valid deliverables and supplies a fallback", () => {
        expect(
            normalizeCreativeDeliverables(
                [
                    { title: "主视觉", type: "image", role: "活动首屏" },
                    { title: "坏数据", type: "file", role: "忽略" },
                ],
                { title: "当前图片", type: "image", role: "当前生成结果" },
            ),
        ).toEqual([{ title: "主视觉", type: "image", role: "活动首屏" }]);
        expect(normalizeCreativeDeliverables([], { title: "当前视频", type: "video", role: "核心视频" })).toHaveLength(1);
    });

    it("keeps complete planner and review collections", () => {
        const taskIds = Array.from({ length: 12 }, (_, index) => `image-${index}`);
        const review = normalizeCreativeReview(
            {
                mode: "visual",
                status: "needs_revision",
                summary: "需要逐项调整",
                issues: taskIds.map((taskId) => ({ taskId, category: "一致性", severity: "high", message: `${taskId} 需要调整` })),
                retryTaskIds: taskIds,
            },
            new Set(taskIds),
        );

        expect(
            normalizeCreativeDeliverables(
                taskIds.map((id) => ({ title: id, type: "image", role: "候选图" })),
                { title: "回退", type: "image", role: "回退" },
            ),
        ).toHaveLength(12);
        expect(review?.issues).toHaveLength(12);
        expect(review?.retryTaskIds).toEqual(taskIds);
    });

    it("validates review scores, issues and retry task ids", () => {
        expect(
            normalizeCreativeReview(
                {
                    mode: "visual",
                    status: "needs_revision",
                    score: 140,
                    summary: "主体偏离",
                    issues: [{ taskId: "image-1", category: "主体", severity: "high", message: "商品颜色变化" }],
                    retryTaskIds: ["image-1", "unknown", "image-1"],
                },
                new Set(["image-1"]),
            ),
        ).toEqual({
            mode: "visual",
            status: "needs_revision",
            score: 100,
            summary: "主体偏离",
            issues: [{ taskId: "image-1", category: "主体", severity: "high", message: "商品颜色变化" }],
            retryTaskIds: ["image-1"],
        });
    });

    it("does not retry low-severity or passed tasks", () => {
        expect(normalizeCreativeReview({ mode: "visual", status: "passed", summary: "可用", issues: [{ taskId: "image", category: "细节", severity: "high", message: "轻微问题" }], retryTaskIds: ["image"] }, new Set(["image"]))?.retryTaskIds).toEqual([]);
        expect(
            normalizeCreativeReview({ mode: "visual", status: "needs_revision", summary: "需调整", issues: [{ taskId: "image", category: "细节", severity: "low", message: "轻微问题" }], retryTaskIds: ["image"] }, new Set(["image"]))?.retryTaskIds,
        ).toEqual([]);
    });
});
