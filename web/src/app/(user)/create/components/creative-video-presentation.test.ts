import { describe, expect, it } from "vitest";

import type { CreativeAsset, CreativeMessage } from "@/lib/creative-runtime-contract";

import { creativeVideoPresentation, formatVideoTime } from "./creative-video-presentation";

describe("creative video presentation", () => {
    it("reads only public playback metadata and ignores removed storyboard content", () => {
        const presentation = creativeVideoPresentation(message({ generation: { coverUrl: "/cover.webp", resolution: "1080p", ratio: "9:16", highlights: [{ title: "不再展示" }], scenes: [{ start: 0, end: 3 }] } }), asset({}));

        expect(presentation).toEqual({ coverUrl: "/cover.webp", resolution: "1080P", ratio: "9:16" });
        expect(presentation).not.toHaveProperty("highlights");
        expect(presentation).not.toHaveProperty("scenes");
    });

    it("prefers per-result asset metadata and accepts a run ratio fallback", () => {
        const presentation = creativeVideoPresentation(message({ generation: { coverUrl: "/message.webp" } }), asset({ posterUrl: "/asset.webp", aspectRatio: "1080x1920" }), "720", "16:9");

        expect(presentation).toEqual({ coverUrl: "/asset.webp", resolution: "720P", ratio: "1080:1920" });
    });

    it("formats real playback time without fixed durations", () => {
        expect(formatVideoTime(0)).toBe("00:00");
        expect(formatVideoTime(65.9)).toBe("01:05");
    });
});

function message(metadata: Record<string, unknown>): CreativeMessage {
    return { id: "message-one", conversationId: "conversation-one", sequence: 2, role: "assistant", status: "completed", content: "视频已生成。", metadata, createdAt: 1, updatedAt: 1 };
}

function asset(metadata: Record<string, unknown>): CreativeAsset {
    return {
        id: "video-one",
        userId: "user-one",
        conversationId: "conversation-one",
        messageId: "message-one",
        sourceRunId: "run-one",
        ordinal: 0,
        type: "video",
        status: "ready",
        title: "生成视频",
        serverUrl: "/video.mp4",
        durationMs: 15_000,
        metadata,
        createdAt: 1,
        updatedAt: 1,
    };
}
