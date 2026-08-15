import { describe, expect, it } from "vitest";

import { AGENT_PLAN_SCHEMA_VERSION, buildAgentRunPlannerAudit } from "./agent-run-audit";

describe("Agent Run audit snapshot", () => {
    it("keeps the actual planner route, billing and immutable effective Skill content", () => {
        const skill = {
            id: "skill-one",
            name: "商品视觉",
            description: "商品规划说明",
            plannerSummary: "规划时使用的摘要",
            instructions: "执行时保持商品一致",
            enabled: true,
            keywords: ["商品", "海报"],
            workspaces: ["canvas" as const],
            action: "edit" as const,
            requiresReference: true,
            defaultConfig: { imageCount: 2, quality: "high" },
            sourceUrl: "https://github.com/example/repo/blob/abcdef/skills/product/SKILL.md",
            sourceRepository: "example/repo",
            sourcePath: "skills/product/SKILL.md",
            sourceVersion: "1.2.0",
            sourceCommit: "abcdef",
            sourceContentHash: "hash",
            license: "MIT",
        };
        const audit = buildAgentRunPlannerAudit({
            mode: "model",
            logicalModelId: "planner",
            channelId: "planner-backup",
            upstreamModel: "vendor/planner-v2",
            protocol: "chat",
            elapsedMs: 1234,
            pointsCost: 1.25,
            pointsRecordId: "points-plan",
            skills: [skill],
        });

        skill.instructions = "后续被管理员修改";
        skill.keywords.push("新关键词");
        skill.defaultConfig.imageCount = 4;

        expect(audit).toEqual({
            schemaVersion: AGENT_PLAN_SCHEMA_VERSION,
            mode: "model",
            logicalModelId: "planner",
            channelId: "planner-backup",
            upstreamModel: "vendor/planner-v2",
            protocol: "chat",
            elapsedMs: 1234,
            pointsCost: 1.25,
            pointsRecordId: "points-plan",
            skills: [
                {
                    id: "skill-one",
                    name: "商品视觉",
                    description: "商品规划说明",
                    plannerSummary: "规划时使用的摘要",
                    instructions: "执行时保持商品一致",
                    enabled: true,
                    keywords: ["商品", "海报"],
                    workspaces: ["canvas"],
                    action: "edit",
                    requiresReference: true,
                    defaultConfig: { imageCount: 2, quality: "high" },
                    sourceUrl: "https://github.com/example/repo/blob/abcdef/skills/product/SKILL.md",
                    sourceRepository: "example/repo",
                    sourcePath: "skills/product/SKILL.md",
                    sourceVersion: "1.2.0",
                    sourceCommit: "abcdef",
                    sourceContentHash: "hash",
                    license: "MIT",
                },
            ],
        });
    });
});
