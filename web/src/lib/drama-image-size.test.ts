import { describe, expect, it } from "vitest";

import { dramaOutputDimensions, normalizeDramaImageSize, resolveDramaGenerationSize } from "./drama-image-size";

describe("drama image size", () => {
    it("accepts supported ratios and unrestricted exact dimensions", () => {
        expect(normalizeDramaImageSize("16:9")).toBe("16:9");
        expect(normalizeDramaImageSize("1080×1920")).toBe("1080x1920");
        expect(normalizeDramaImageSize("5000x5000")).toBe("5000x5000");
    });

    it("uses prompt, custom dimensions, reference ratio, then project ratio", () => {
        const base = { projectSize: "1824x1024", prompt: "生成镜头", references: [{ width: 1024, height: 1536 }] };
        expect(resolveDramaGenerationSize({ ...base, prompt: "生成 1280x720 镜头" })).toBe("1280x720");
        expect(resolveDramaGenerationSize(base)).toBe("1824x1024");
        expect(resolveDramaGenerationSize({ ...base, projectSize: "16:9" })).toBe("2:3");
        expect(resolveDramaGenerationSize({ projectSize: "16:9", prompt: "生成镜头" })).toBe("16:9");
    });

    it("keeps exact project dimensions for rendering and export", () => {
        expect(dramaOutputDimensions("1080x1920")).toEqual({ width: 1080, height: 1920 });
        expect(dramaOutputDimensions("16:9", 1920, 1080)).toEqual({ width: 1920, height: 1080 });
    });
});
