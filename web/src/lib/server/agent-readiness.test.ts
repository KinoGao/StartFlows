import { describe, expect, it } from "vitest";
import { buildAgentReadiness } from "./agent-readiness";

describe("buildAgentReadiness", () => {
    it("requires every default model to belong to an enabled channel", () => {
        const settings = {
            defaultModels: { textModel: "t", imageModel: "i", videoModel: "v", audioModel: "a" },
            logicalModels: [],
            systemChannels: [
                {
                    id: "one",
                    name: "主渠道",
                    enabled: true,
                    baseUrl: "https://api.example.com/v1",
                    apiKey: "test",
                    models: ["t", "i", "v", "a"],
                    advancedConfig: { modelCapabilities: { t: "text", i: "image", v: "video", a: "audio" } },
                },
            ],
            agentSkills: [{ enabled: true, workspaces: ["image", "canvas"] }],
            generationDefaults: {},
            generationConcurrency: {},
        } as never;
        const result = buildAgentReadiness(settings);
        expect(result.ready).toBe(true);
        expect(result.skills).toEqual({ image: 1, video: 0, canvas: 1, drama: 0 });
    });

    it("reports missing or disabled model channels", () => {
        const settings = {
            defaultModels: { textModel: "t", imageModel: "", videoModel: "v", audioModel: "a" },
            logicalModels: [],
            systemChannels: [{ id: "one", name: "停用", enabled: false, baseUrl: "https://api.example.com/v1", apiKey: "test", models: ["t", "v", "a"] }],
            agentSkills: [],
            generationDefaults: {},
            generationConcurrency: {},
        } as never;
        const result = buildAgentReadiness(settings);
        expect(result.ready).toBe(false);
        expect(result.capabilities.filter((item) => !item.ready)).toHaveLength(4);
    });

    it("accepts equivalent models prefixes and casing", () => {
        const settings = {
            defaultModels: { textModel: "text-v1", imageModel: "", videoModel: "", audioModel: "" },
            logicalModels: [],
            systemChannels: [{ id: "one", name: "主渠道", enabled: true, baseUrl: "https://api.example.com/v1", apiKey: "test", models: ["models/TEXT-V1"] }],
            agentSkills: [],
            generationDefaults: {},
            generationConcurrency: {},
        } as never;
        expect(buildAgentReadiness(settings).capabilities.find((item) => item.type === "text")?.ready).toBe(true);
    });
});
