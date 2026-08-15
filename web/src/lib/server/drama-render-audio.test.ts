import { describe, expect, it } from "vitest";

import { normalizeDramaShotAudioMode, resolveDramaRenderAudioPlan } from "./drama-render-audio";

describe("drama render audio", () => {
    it("keeps a generated video audio track in source mode", () => {
        expect(resolveDramaRenderAudioPlan("source", "", true)).toBe("source");
    });

    it("falls back to silence when source video has no audio", () => {
        expect(resolveDramaRenderAudioPlan("source", "", false)).toBe("silence");
        expect(resolveDramaRenderAudioPlan("mute", "/voice.mp3", true)).toBe("silence");
    });

    it("uses dedicated voiceover only when it is ready", () => {
        expect(resolveDramaRenderAudioPlan("voiceover", "/voice.mp3", true)).toBe("voiceover");
        expect(() => resolveDramaRenderAudioPlan("voiceover", "", true)).toThrow("AI 配音尚未完成");
    });

    it("normalizes unknown modes to source audio", () => {
        expect(normalizeDramaShotAudioMode("mute")).toBe("mute");
        expect(normalizeDramaShotAudioMode("unknown")).toBe("source");
    });
});
