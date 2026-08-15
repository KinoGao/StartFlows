import { describe, expect, it } from "vitest";

import { listPointCostModels, resolvePointCostModelCapability } from "./admin-quota-rules";

describe("积分规则模型分类", () => {
    const settings = {
        logicalModels: [
            {
                id: "visual-model",
                name: "视觉模型",
                capability: "image" as const,
                enabled: true,
                bindings: [{ id: "binding-1", channelId: "channel-1", upstreamModel: "vendor-omni", enabled: true, priority: 1 }],
            },
        ],
    };

    it("prefers the configured logical capability over model-name guessing", () => {
        expect(resolvePointCostModelCapability(settings, "visual-model")).toBe("image");
        expect(resolvePointCostModelCapability(settings, "vendor-omni")).toBe("image");
    });

    it("classifies common unbound model names", () => {
        expect(resolvePointCostModelCapability(settings, "gpt-image-2")).toBe("image");
        expect(resolvePointCostModelCapability(settings, "seedance-video-pro")).toBe("video");
        expect(resolvePointCostModelCapability(settings, "speech-tts-1")).toBe("audio");
        expect(resolvePointCostModelCapability(settings, "gpt-5.4")).toBe("text");
    });

    it("lists logical billing keys without duplicating their upstream aliases", () => {
        expect(
            listPointCostModels({
                ...settings,
                systemChannels: [{ id: "channel-1", name: "渠道", baseUrl: "", apiKey: "", apiFormat: "openai", models: ["vendor-omni"], enabled: true }],
                modelPointCosts: { "vendor-omni": 2, "manual-model": 4 },
            }),
        ).toEqual(["visual-model", "manual-model"]);
    });

    it("keeps raw channel models when logical routing is not configured", () => {
        expect(
            listPointCostModels({
                logicalModels: [],
                systemChannels: [{ id: "channel-1", name: "渠道", baseUrl: "", apiKey: "", apiFormat: "openai", models: ["raw-text"], enabled: true }],
                modelPointCosts: {},
            }),
        ).toEqual(["raw-text"]);
    });
});
