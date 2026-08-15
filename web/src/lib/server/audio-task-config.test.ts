import { describe, expect, it } from "vitest";

import { resolveAudioTaskOptions } from "./audio-task-config";

describe("resolveAudioTaskOptions", () => {
    const defaults = { audioVoice: "nova", audioFormat: "wav" };

    it("uses backend generation defaults when request parameters are missing", () => {
        expect(resolveAudioTaskOptions(undefined, defaults)).toEqual({ voice: "nova", format: "wav", speed: "1" });
    });

    it("keeps explicit request parameters", () => {
        expect(resolveAudioTaskOptions({ voice: "alloy", format: "mp3", speed: "1.25" }, defaults)).toEqual({ voice: "alloy", format: "mp3", speed: "1.25" });
    });

    it("treats blank request parameters as missing", () => {
        expect(resolveAudioTaskOptions({ voice: " ", format: "", speed: " " }, defaults)).toEqual({ voice: "nova", format: "wav", speed: "1" });
    });
});
