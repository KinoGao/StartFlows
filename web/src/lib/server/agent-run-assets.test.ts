import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentRun, AgentRunTask } from "./agent-run-store";

const mocks = vi.hoisted(() => ({ registerCreativeAssets: vi.fn() }));

vi.mock("@/lib/server/creative-runtime-store", () => ({ registerCreativeAssets: mocks.registerCreativeAssets }));

import { registerAgentTaskAssets } from "./agent-run-assets";

describe("registerAgentTaskAssets", () => {
    beforeEach(() => {
        mocks.registerCreativeAssets.mockReset().mockImplementation(async (inputs: Array<Record<string, unknown>>) => inputs);
    });

    it("preserves emoji in a persisted Agent text asset", async () => {
        const content = "今天也要保持好心情 😊❤️🚀";
        await registerAgentTaskAssets(run(), task(), { content }, ["text-task-one"]);

        expect(mocks.registerCreativeAssets).toHaveBeenCalledWith([
            expect.objectContaining({
                conversationId: "conversation-one",
                messageId: "assistant-message",
                sourceRunId: "run-one",
                sourceTaskId: "text-task-one",
                type: "text",
                textContent: content,
            }),
        ]);
    });

    it("normalizes multiple provider results and keeps public playback metadata", async () => {
        await registerAgentTaskAssets(
            run(),
            { ...task(), type: "video", title: "视频", count: 1 },
            { data: { videos: [{ url: "https://cdn.example.com/one.mp4", posterUrl: "https://cdn.example.com/one.webp", ratio: "9:16", width: 1080, height: 1920 }, { error: "第二条失败" }, { url: "https://cdn.example.com/two.mp4" }] } },
            ["video-task-one"],
        );

        expect(mocks.registerCreativeAssets).toHaveBeenCalledWith([
            expect.objectContaining({ ordinal: 0, remoteUrl: "https://cdn.example.com/one.mp4", width: 1080, height: 1920, metadata: expect.objectContaining({ coverUrl: "https://cdn.example.com/one.webp", ratio: "9:16" }) }),
            expect.objectContaining({ ordinal: 1, remoteUrl: "https://cdn.example.com/two.mp4" }),
        ]);
    });
});

function run(): AgentRun {
    return {
        id: "run-one",
        userId: "user-one",
        conversationId: "conversation-one",
        clientRequestId: "request-one",
        surface: "chat",
        inputMessageId: "user-message",
        assistantMessageId: "assistant-message",
        prompt: "写一篇带表情的文章",
        referencedAssetIds: [],
        assetIds: [],
        status: "running",
        tasks: [],
        reviewed: false,
        createdAt: 1,
        updatedAt: 1,
    };
}

function task(): AgentRunTask {
    return {
        id: "article-one",
        title: "夏日新品推文",
        type: "text",
        prompt: "写一篇带表情的文章",
        count: 1,
        dependencies: [],
        status: "completed",
        attempts: 1,
    };
}
