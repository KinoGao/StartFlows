import { describe, expect, it } from "vitest";

import type { CreativeAsset } from "@/lib/creative-runtime-contract";
import { normalizeAgentProjectHandoff } from "./agent-run-project-handoff";
import type { AgentPlan } from "./agent-run-validation";

const plan: AgentPlan = {
    intent: "generation",
    objective: "整理品牌内容",
    foundation: {
        complexity: "complex",
        brief: { objective: "建立完整品牌项目" },
        direction: { summary: "克制的现代视觉" },
    },
    projectHandoff: {
        surface: "canvas",
        title: " 品牌画布 ",
        assetIds: ["asset-one", "asset-one"],
    },
    deliverables: [],
};

const referencedAsset = {
    id: "asset-one",
    userId: "user-one",
    conversationId: "conversation-one",
    ordinal: 0,
    type: "image",
    status: "ready",
    title: "主视觉",
    metadata: {},
    createdAt: 1,
    updatedAt: 1,
} satisfies CreativeAsset;

describe("Agent 项目交接规划", () => {
    it("normalizes a chat handoff and deduplicates referenced assets", () => {
        expect(normalizeAgentProjectHandoff(plan, "chat", [referencedAsset], "把这些内容建立成画布项目")).toEqual({
            surface: "canvas",
            title: "品牌画布",
            summary: "建立完整品牌项目",
            style: "克制的现代视觉",
            ratio: "16:9",
            assetIds: ["asset-one"],
        });
    });

    it("ignores nested project creation and rejects assets outside the current references", () => {
        expect(normalizeAgentProjectHandoff(plan, "canvas", [referencedAsset], "把这些内容建立成画布项目")).toBeUndefined();
        expect(() => normalizeAgentProjectHandoff(plan, "chat", [], "把这些内容建立成画布项目")).toThrow("项目交接引用了不存在的资产");
    });
});
