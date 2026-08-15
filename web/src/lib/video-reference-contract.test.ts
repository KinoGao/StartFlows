import { describe, expect, it } from "vitest";

import { normalizeVideoGenerationReferences } from "./video-reference-contract";

describe("video reference contract", () => {
    it("keeps ordinary references without treating missing frames as duplicates", () => {
        expect(normalizeVideoGenerationReferences(undefined)).toEqual([]);
        expect(normalizeVideoGenerationReferences([{ type: "image", url: "https://cdn.example.com/reference.png" }])).toEqual([{ type: "image", url: "https://cdn.example.com/reference.png", role: "reference" }]);
    });

    it("accepts one distinct first and last frame", () => {
        expect(
            normalizeVideoGenerationReferences([
                { type: "image", url: "https://cdn.example.com/first.png", role: "first_frame" },
                { type: "image", url: "https://cdn.example.com/last.png", role: "last_frame" },
            ]),
        ).toEqual([
            { type: "image", url: "https://cdn.example.com/first.png", role: "first_frame" },
            { type: "image", url: "https://cdn.example.com/last.png", role: "last_frame" },
        ]);
    });

    it("keeps all ordinary references when no upstream capability limit is declared", () => {
        const references = Array.from({ length: 24 }, (_, index) => ({ type: "image" as const, url: `https://cdn.example.com/reference-${index}.png` }));
        expect(normalizeVideoGenerationReferences(references)).toHaveLength(references.length);
    });

    it.each([
        [[{ type: "image", url: "https://cdn.example.com/last.png", role: "last_frame" }], "指定尾帧时必须同时指定首帧"],
        [
            [
                { type: "image", url: "https://cdn.example.com/same.png", role: "first_frame" },
                { type: "image", url: "https://cdn.example.com/same.png", role: "last_frame" },
            ],
            "首帧和尾帧不能使用同一张图片",
        ],
        [[{ type: "video", url: "https://cdn.example.com/clip.mp4", role: "first_frame" }], "视频首尾帧只能使用图片素材"],
    ])("rejects invalid frame roles", (references, message) => {
        expect(() => normalizeVideoGenerationReferences(references)).toThrow(message);
    });
});
