import { describe, expect, it } from "vitest";

import { creativeAgentModelCapabilities, groupCreativeAgentModels, resolveCreativeAgentModelCapabilities, type CreativeAgentModelOption } from "./creative-agent-controls";

describe("creative agent model categories", () => {
    it("keeps all media categories in a stable order and groups available models", () => {
        const models: CreativeAgentModelOption[] = [
            { id: "video-one", name: "视频一", capability: "video" },
            { id: "image-one", name: "图片一", capability: "image" },
            { id: "video-two", name: "视频二", capability: "video" },
        ];

        expect(creativeAgentModelCapabilities).toEqual(["image", "video", "audio"]);
        expect(groupCreativeAgentModels(models)).toEqual({ image: [models[1]], video: [models[0], models[2]], audio: [] });
    });

    it("limits workbench model categories while keeping the shared default", () => {
        expect(resolveCreativeAgentModelCapabilities(["image"])).toEqual(["image"]);
        expect(resolveCreativeAgentModelCapabilities(["video"])).toEqual(["video"]);
        expect(resolveCreativeAgentModelCapabilities(["video", "audio"])).toEqual(["video", "audio"]);
        expect(resolveCreativeAgentModelCapabilities([])).toEqual(["image", "video", "audio"]);
        expect(resolveCreativeAgentModelCapabilities()).toEqual(["image", "video", "audio"]);
    });
});
