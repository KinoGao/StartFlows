import { describe, expect, it } from "vitest";

import { normalizeCreativeReviewAssets } from "./creative-review-assets";

describe("creative review route", () => {
    it("accepts reviewable generated image sources and rejects unsafe schemes", () => {
        expect(
            normalizeCreativeReviewAssets(
                [
                    { id: "data", url: "data:image/png;base64,AA==" },
                    { id: "server", url: "/api/generation-log-assets/result.png" },
                    { id: "remote", url: "https://cdn.example.com/result.png" },
                    { id: "http", url: "http://cdn.example.com/result.png" },
                    { id: "blob", url: "blob:local" },
                ],
                "image",
            ),
        ).toEqual([
            { id: "data", url: "data:image/png;base64,AA==" },
            { id: "server", url: "/api/generation-log-assets/result.png" },
            { id: "remote", url: "https://cdn.example.com/result.png" },
        ]);
    });

    it("only accepts server or HTTPS video sources and keeps the review input bounded", () => {
        expect(
            normalizeCreativeReviewAssets(
                [
                    { id: "server", url: "/api/generation-log-assets/video.mp4" },
                    { id: "remote", url: "https://cdn.example.com/video.mp4" },
                    { id: "blob", url: "blob:local" },
                    { id: "data", url: "data:video/mp4;base64,AA==" },
                    { id: "file", url: "file:///tmp/video.mp4" },
                    { id: "javascript", url: "javascript:alert(1)" },
                    { id: "too-large", url: "https://cdn.example.com/" + "x".repeat(8_000_000) },
                ],
                "video",
            ),
        ).toEqual([
            { id: "server", url: "/api/generation-log-assets/video.mp4" },
            { id: "remote", url: "https://cdn.example.com/video.mp4" },
        ]);
    });
});
