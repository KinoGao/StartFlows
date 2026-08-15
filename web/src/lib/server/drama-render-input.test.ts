import { describe, expect, it } from "vitest";

import { normalizeDramaRenderShots } from "./drama-render-input";

describe("normalizeDramaRenderShots", () => {
    it("keeps every render shot, explicit duration and full subtitle", () => {
        const longSubtitle = "完整字幕".repeat(700);
        const shots = Array.from({ length: 61 }, (_, index) => ({
            videoUrl: `/api/reference-assets/video-${index}.mp4`,
            audioMode: "source",
            subtitle: index === 60 ? longSubtitle : `字幕 ${index}`,
            duration: index === 60 ? 21 : 5,
        }));

        const result = normalizeDramaRenderShots(shots);

        expect(result).toHaveLength(61);
        expect(result[60]).toMatchObject({ duration: 21, subtitle: longSubtitle, videoUrl: "/api/reference-assets/video-60.mp4" });
    });
});
