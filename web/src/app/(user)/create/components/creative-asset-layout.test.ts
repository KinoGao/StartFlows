import { describe, expect, it } from "vitest";

import { creativeAssetLayout, parseCreativeAspectRatio } from "./creative-asset-layout";

describe("creative asset layout", () => {
    it.each([
        ["1:1", { width: 1024, height: 1024 }, { width: 420, height: 420 }],
        ["16:9", { width: 1920, height: 1080 }, { width: 560, height: 315 }],
        ["9:16", { width: 720, height: 1280 }, { width: 300, height: 533 }],
        ["3:4", { width: 900, height: 1200 }, { width: 360, height: 480 }],
        ["超长图", { width: 1000, height: 4000 }, { width: 320, height: 1280 }],
    ])("sizes an image result for %s without changing its ratio", (_label, asset, expected) => {
        expect(creativeAssetLayout(asset, { variant: "image-result" })).toMatchObject(expected);
    });

    it.each([
        ["16:9", { width: 1920, height: 1080 }, { width: 520, height: 293 }],
        ["1:1", { width: 1024, height: 1024 }, { width: 420, height: 420 }],
        ["9:16", { width: 720, height: 1280 }, { width: 300, height: 533 }],
        ["4:3", { width: 1600, height: 1200 }, { width: 500, height: 375 }],
    ])("sizes a video result for %s", (_label, asset, expected) => {
        expect(creativeAssetLayout(asset, { variant: "video-result" })).toMatchObject(expected);
    });

    it("does not upscale low-resolution media", () => {
        expect(creativeAssetLayout({ width: 256, height: 256 }, { variant: "image-result" })).toMatchObject({ width: 256, height: 256 });
        expect(creativeAssetLayout({ width: 320, height: 180 }, { variant: "video-result" })).toMatchObject({ width: 320, height: 180 });
    });

    it("caps message-flow previews to one third of the viewport while keeping the source ratio", () => {
        expect(creativeAssetLayout({ width: 1024, height: 1024 }, { variant: "image-result" })?.container.width).toBe("min(420px, 33.333333dvh)");
        expect(creativeAssetLayout({ width: 1920, height: 1080 }, { variant: "video-result" })?.container.width).toBe("min(520px, 59.259259dvh)");
    });

    it("uses ratio metadata only when dimensions are unavailable", () => {
        expect(creativeAssetLayout({}, { variant: "video-result", ratio: "9:16" })).toMatchObject({ width: 300, height: 533 });
        expect(creativeAssetLayout({}, { variant: "image-result", ratio: "1920x1080" })).toMatchObject({ width: 560, height: 315 });
    });

    it("keeps compact historical media bounded and rejects missing dimensions", () => {
        expect(creativeAssetLayout({ width: 1920, height: 1080 })).toMatchObject({ width: 200, height: 113 });
        expect(creativeAssetLayout({})).toBeNull();
        expect(creativeAssetLayout({ width: 0, height: 1080 })).toBeNull();
    });

    it("parses supported ratio formats", () => {
        expect(parseCreativeAspectRatio("16:9")).toBeCloseTo(16 / 9);
        expect(parseCreativeAspectRatio("1080×1920")).toBeCloseTo(9 / 16);
        expect(parseCreativeAspectRatio("auto")).toBeUndefined();
    });
});
