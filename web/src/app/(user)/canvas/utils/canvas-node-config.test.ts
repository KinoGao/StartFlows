import { describe, expect, it } from "vitest";

import { defaultConfig, type AiConfig } from "@/stores/use-config-store";
import { resolveCanvasGenerationModel } from "./canvas-node-config";

const config: AiConfig = {
    ...defaultConfig,
    model: "image-main",
    imageModel: "image-main",
    videoModel: "studio-motion",
    textModel: "writer-main",
    audioModel: "voice-main",
    models: ["image-main", "image-alt", "studio-motion", "writer-main", "voice-main"],
    imageModels: ["image-main", "image-alt"],
    videoModels: ["studio-motion"],
    textModels: ["writer-main"],
    audioModels: ["voice-main"],
};

describe("resolveCanvasGenerationModel", () => {
    it("switches to the first model exposed by the selected capability", () => {
        expect(resolveCanvasGenerationModel(config, "video", "image-alt")).toBe("studio-motion");
        expect(resolveCanvasGenerationModel(config, "text", "studio-motion")).toBe("writer-main");
        expect(resolveCanvasGenerationModel(config, "audio", "writer-main")).toBe("voice-main");
    });

    it("preserves a model that belongs to the selected capability", () => {
        expect(resolveCanvasGenerationModel(config, "image", "IMAGE-ALT")).toBe("image-alt");
    });

    it("does not show an unavailable model when the capability has no configured model", () => {
        expect(resolveCanvasGenerationModel({ ...config, videoModels: [] }, "video", "image-main")).toBe("");
    });
});
