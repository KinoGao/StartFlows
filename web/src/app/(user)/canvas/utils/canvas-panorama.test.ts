import { describe, expect, it } from "vitest";

import { buildPanoramaPrompt, isPanoramaRatio } from "./canvas-panorama";

describe("canvas panorama", () => {
    it("builds an idempotent equirectangular prompt", () => {
        const first = buildPanoramaPrompt("未来城市大厅", false);
        expect(buildPanoramaPrompt(first, false)).toBe(first);
        expect(first).toContain("2:1 等距柱状投影全景图");
    });

    it("recognizes practical 2:1 dimensions", () => {
        expect(isPanoramaRatio(2048, 1024)).toBe(true);
        expect(isPanoramaRatio(1920, 1080)).toBe(false);
    });
});
