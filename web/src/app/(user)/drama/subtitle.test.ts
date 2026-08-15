import { describe, expect, it } from "vitest";

import { buildSrt, buildSubtitleCues } from "./subtitle";
import type { DramaShot } from "./types";

const shot = (duration: number, subtitle: string): DramaShot => ({
    id: String(duration),
    order: duration,
    title: "",
    description: "",
    sourceText: "",
    shotBoundary: "",
    dialogue: "",
    narration: "",
    utterances: [],
    subtitle,
    imagePrompt: "",
    videoPrompt: "",
    cameraMotion: "",
    duration,
    characterIds: [],
    propIds: [],
    clueIds: [],
});

describe("drama subtitles", () => {
    it("keeps empty shots in the timeline while omitting empty cues", () => {
        expect(buildSubtitleCues([shot(3, "第一句"), shot(2, ""), shot(4, "第二句")])).toEqual([
            { index: 1, startMs: 0, endMs: 3000, text: "第一句" },
            { index: 2, startMs: 5000, endMs: 9000, text: "第二句" },
        ]);
    });

    it("exports standard SRT timestamps", () => {
        expect(buildSrt([shot(3, "第一句"), shot(2, "第二句")])).toBe("1\n00:00:00,000 --> 00:00:03,000\n第一句\n\n2\n00:00:03,000 --> 00:00:05,000\n第二句");
    });
});
