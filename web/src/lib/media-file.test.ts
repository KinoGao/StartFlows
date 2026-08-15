import { describe, expect, it } from "vitest";

import { ensureMediaFileExtension, mediaDownloadFileName, mediaFileExtension } from "./media-file";

describe("media file names", () => {
    it("maps image, video, and audio MIME types to real file extensions", () => {
        expect(mediaFileExtension("image/jpeg", "", "png")).toBe("jpg");
        expect(mediaFileExtension("video/quicktime", "", "mp4")).toBe("mov");
        expect(mediaFileExtension("video/webm", "", "mp4")).toBe("webm");
        expect(mediaFileExtension("audio/mpeg", "", "bin")).toBe("mp3");
    });

    it("uses data and server URLs when MIME metadata is unavailable", () => {
        expect(mediaFileExtension(undefined, "data:image/webp;base64,AAAA", "png")).toBe("webp");
        expect(mediaFileExtension(undefined, "/api/generation-log-assets/result.mp4?download=original", "bin")).toBe("mp4");
    });

    it("adds or corrects extensions without changing compatible JPEG names", () => {
        expect(ensureMediaFileExtension("海报", "image/png")).toBe("海报.png");
        expect(ensureMediaFileExtension("海报.webp", "image/png")).toBe("海报.png");
        expect(ensureMediaFileExtension("照片.jpeg", "image/jpeg")).toBe("照片.jpeg");
        expect(ensureMediaFileExtension("产品.v1", "video/webm")).toBe("产品.v1.webm");
    });

    it("gives persisted media stable unique download names", () => {
        const first = mediaDownloadFileName("生成结果", "image/png", "permanent/2026/07/27/images/20260727-154501-a1b2c3d4-1111-2222-3333-444455556666.png");
        const second = mediaDownloadFileName("生成结果", "image/png", "permanent/2026/07/27/images/20260727-154501-b2c3d4e5-1111-2222-3333-444455556666.png");
        expect(first).toBe("20260727-154501-a1b2c3d4.png");
        expect(second).toBe("20260727-154501-b2c3d4e5.png");
        expect(first).not.toBe(second);
    });

    it("uses a date and stable short id when media has no persisted storage name", () => {
        const name = mediaDownloadFileName("result-one", "video/webm", "https://cdn.example.com/video", new Date("2026-07-27T15:45:01"));
        expect(name).toMatch(/^20260727-154501-[a-f0-9]{8}\.webm$/);
        expect(name).not.toMatch(/[\u3400-\u9fff]/);
    });

    it("creates an ASCII-only archive name with a stable identity suffix", () => {
        const name = mediaDownloadFileName("画布一:画布二", "application/zip", "", new Date("2026-07-27T15:45:01"));
        expect(name).toMatch(/^20260727-154501-[a-f0-9]{8}\.zip$/);
        expect(name).not.toMatch(/[\u3400-\u9fff]/);
    });
});
