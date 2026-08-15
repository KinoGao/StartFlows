import { describe, expect, it } from "vitest";

import { buildSeedanceSpecialRequest } from "./seedance-special";

describe("Seedance special request", () => {
    it("builds the documented multimodal payload", () => {
        expect(
            buildSeedanceSpecialRequest({
                model: "sd_2.0_fast_special_720p_with_video_ref",
                prompt: "product film",
                ratio: "9:16",
                duration: 5,
                references: { images: ["https://cdn.example.com/ref.webp"], videos: ["assetId://video-one"], audios: ["https://cdn.example.com/ref.mp3"] },
            }),
        ).toMatchObject({
            model: "sd_2.0_fast_special_720p_with_video_ref",
            ratio: "9:16",
            duration: 5,
            content: [
                { type: "text", text: "product film" },
                { type: "image_url", role: "reference_image" },
                { type: "video_url", role: "reference_video" },
                { type: "audio_url", role: "reference_audio" },
            ],
        });
    });

    it("builds distinct first-frame and last-frame content entries", () => {
        expect(
            buildSeedanceSpecialRequest({
                model: "sd_2.0_fast_special_720p",
                prompt: "continuous camera move",
                ratio: "16:9",
                duration: 5,
                references: [
                    { type: "image", url: "https://cdn.example.com/first.png", role: "first_frame" },
                    { type: "image", url: "https://cdn.example.com/last.png", role: "last_frame" },
                ],
            }),
        ).toMatchObject({
            content: [
                { type: "text", text: "continuous camera move" },
                { type: "image_url", role: "first_frame", image_url: { url: "https://cdn.example.com/first.png" } },
                { type: "image_url", role: "last_frame", image_url: { url: "https://cdn.example.com/last.png" } },
            ],
        });
    });

    it.each([
        [
            [
                { type: "image", url: "https://cdn.example.com/first.png", role: "first_frame" },
                { type: "image", url: "https://cdn.example.com/reference.png", role: "reference" },
            ],
            "不能混用普通图片、视频或音频参考",
        ],
        [[{ type: "image", url: "https://cdn.example.com/first.png", role: "first_frame" }], "视频参考模型不能用于首帧或首尾帧模式"],
    ])("rejects invalid frame-mode combinations", (references, message) => {
        expect(() =>
            buildSeedanceSpecialRequest({
                model: message.includes("视频参考模型") ? "sd_2.0_fast_special_720p_with_video_ref" : "sd_2.0_fast_special_720p",
                prompt: "continuous camera move",
                ratio: "16:9",
                duration: 5,
                references: references as Parameters<typeof buildSeedanceSpecialRequest>[0]["references"],
            }),
        ).toThrow(message);
    });

    it.each([
        [{ model: "unknown", prompt: "test", ratio: "16:9", duration: 5 }, "模型不在接口文档允许列表"],
        [{ model: "sd_2.0_fast_special_720p", prompt: "test", ratio: "2:1", duration: 5 }, "不支持画幅"],
        [{ model: "sd_2.0_fast_special_720p", prompt: "test", ratio: "16:9", duration: 3 }, "4-15 秒整数"],
        [{ model: "sd_2.0_fast_special_720p", prompt: "test", ratio: "16:9", duration: 5, references: { images: ["data:image/png;base64,AAAA"] } }, "不能使用 base64"],
        [{ model: "sd_2.0_fast_special_720p", prompt: "test", ratio: "16:9", duration: 5, references: { audios: ["https://cdn.example.com/ref.mp3"] } }, "参考音频不能单独使用"],
        [{ model: "sd_2.0_fast_special_720p_with_video_ref", prompt: "test", ratio: "16:9", duration: 5 }, "要求至少一个参考视频"],
    ])("rejects invalid documented constraints", (input, message) => {
        expect(() => buildSeedanceSpecialRequest(input as Parameters<typeof buildSeedanceSpecialRequest>[0])).toThrow(message);
    });
});
