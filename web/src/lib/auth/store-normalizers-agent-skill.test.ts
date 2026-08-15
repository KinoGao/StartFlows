import { describe, expect, it } from "vitest";

import { normalizeAgentSkill } from "./store-normalizers";

describe("normalizeAgentSkill", () => {
    it("derives a zero-configuration planner summary and preserves full execution instructions", () => {
        const instructions = "完整执行规则".repeat(100);
        const skill = normalizeAgentSkill({ id: "skill", name: "技能", description: "用于规划的简要用途", instructions, enabled: true, keywords: [] });

        expect(skill.plannerSummary).toBe("用于规划的简要用途");
        expect(skill.instructions).toBe(instructions);
    });

    it("limits an explicit planner summary to 240 characters", () => {
        const skill = normalizeAgentSkill({ id: "skill", name: "技能", description: "", plannerSummary: "a".repeat(300), instructions: "执行", enabled: true, keywords: [] });

        expect(skill.plannerSummary).toHaveLength(240);
    });

    it("preserves normalized GitHub provenance across settings persistence", () => {
        const skill = normalizeAgentSkill({
            id: "github-skill",
            name: "公开 Skill",
            description: "公开说明",
            instructions: "完整执行规则",
            enabled: false,
            keywords: [],
            sourceUrl: " https://github.com/acme/skills/blob/0123456789abcdef0123456789abcdef01234567/SKILL.md ",
            sourceRepository: " acme/skills ",
            sourcePath: " poster/SKILL.md ",
            sourceVersion: " 0123456789abcdef0123456789abcdef01234567 ",
            sourceCommit: " 0123456789abcdef0123456789abcdef01234567 ",
            sourceContentHash: ` ${"a".repeat(64)} `,
            license: " MIT ",
        });

        expect(skill).toMatchObject({
            enabled: false,
            sourceUrl: "https://github.com/acme/skills/blob/0123456789abcdef0123456789abcdef01234567/SKILL.md",
            sourceRepository: "acme/skills",
            sourcePath: "poster/SKILL.md",
            sourceVersion: "0123456789abcdef0123456789abcdef01234567",
            sourceCommit: "0123456789abcdef0123456789abcdef01234567",
            sourceContentHash: "a".repeat(64),
            license: "MIT",
        });
    });
});
