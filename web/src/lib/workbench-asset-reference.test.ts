import { describe, expect, it } from "vitest";

import { imageAssetData, referenceImageFromAsset, referenceVideoFromAsset, videoAssetData } from "./workbench-asset-reference";

const storedImage = { url: "blob:local-image", storageKey: "image:1", width: 1024, height: 1024, bytes: 1200, mimeType: "image/png" };
const storedVideo = { url: "blob:local-video", storageKey: "video:1", width: 1280, height: 720, bytes: 2400, mimeType: "video/mp4" };

describe("workbench asset references", () => {
    it("preserves original remote sources when generated media is saved to assets", () => {
        expect(imageAssetData(storedImage, { remoteUrl: "https://cdn.example.com/source.png" })).toMatchObject({ dataUrl: "blob:local-image", remoteUrl: "https://cdn.example.com/source.png" });
        expect(videoAssetData(storedVideo, { remoteUrl: "https://cdn.example.com/source.mp4" })).toMatchObject({ url: "blob:local-video", remoteUrl: "https://cdn.example.com/source.mp4" });
    });

    it("uses the public image source for upstream reference while keeping the local preview", () => {
        expect(referenceImageFromAsset({ title: "人物参考", dataUrl: "blob:asset", remoteUrl: "https://cdn.example.com/person.png" }, storedImage, "reference-1")).toEqual(
            expect.objectContaining({ id: "reference-1", dataUrl: "blob:local-image", storageKey: "image:1", url: "https://cdn.example.com/person.png", remoteUrl: "https://cdn.example.com/person.png" }),
        );
    });

    it("prefers the public video source over a local blob URL", () => {
        expect(referenceVideoFromAsset({ title: "视频参考", url: "blob:asset-video", storageKey: "video:1", remoteUrl: "https://cdn.example.com/reference.mp4", width: 1280, height: 720 }, "reference-video")).toMatchObject({
            id: "reference-video",
            url: "https://cdn.example.com/reference.mp4",
            storageKey: "video:1",
        });
    });
});
