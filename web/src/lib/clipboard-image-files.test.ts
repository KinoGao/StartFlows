import { describe, expect, it } from "vitest";

import { clipboardImageFiles } from "./clipboard-image-files";

describe("clipboard image files", () => {
    it("reads image file items and ignores text or non-image files", () => {
        const image = new File(["image"], "reference.png", { type: "image/png" });
        const video = new File(["video"], "clip.mp4", { type: "video/mp4" });
        const result = clipboardImageFiles({
            files: [] as unknown as FileList,
            items: [
                { kind: "string", getAsFile: () => null },
                { kind: "file", getAsFile: () => image },
                { kind: "file", getAsFile: () => video },
            ] as unknown as DataTransferItemList,
        });
        expect(result).toEqual([image]);
    });

    it("falls back to clipboard files when item access is unavailable", () => {
        const image = new File(["image"], "reference.webp", { type: "image/webp" });
        expect(clipboardImageFiles({ files: [image] as unknown as FileList, items: [] as unknown as DataTransferItemList })).toEqual([image]);
    });
});
