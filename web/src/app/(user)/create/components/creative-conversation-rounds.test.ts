import { describe, expect, it } from "vitest";

import type { CreativeAsset, CreativeMessage } from "@/lib/creative-runtime-contract";
import type { CreativeAgentRun } from "@/services/api/creative";

import { creativeConversationEntries, isMediaCreativeRound } from "./creative-conversation-rounds";

const baseMessage = {
    conversationId: "conversation-one",
    status: "completed",
    metadata: {},
    createdAt: 1,
    updatedAt: 1,
} satisfies Partial<CreativeMessage>;

describe("creativeConversationEntries", () => {
    it("groups adjacent user and assistant messages by stable run id", () => {
        const user = { ...baseMessage, id: "user-one", sequence: 1, role: "user", content: "生成图片", runId: "run-one" } as CreativeMessage;
        const assistant = { ...baseMessage, id: "assistant-one", sequence: 2, role: "assistant", content: "已完成", runId: "run-one" } as CreativeMessage;
        const run = runFixture();

        expect(creativeConversationEntries([user, assistant], { "run-one": run })).toEqual([{ type: "round", id: "run-one", user, assistant, run }]);
    });

    it("keeps mismatched or paginated messages independent", () => {
        const assistant = { ...baseMessage, id: "assistant-one", sequence: 2, role: "assistant", content: "已完成", runId: "run-one" } as CreativeMessage;
        expect(creativeConversationEntries([assistant], {})).toEqual([{ type: "message", id: assistant.id, message: assistant, run: undefined }]);
    });
});

describe("isMediaCreativeRound", () => {
    it("recognizes media from assets, tasks or explicit preferences", () => {
        expect(isMediaCreativeRound(undefined, [{ type: "image" } as CreativeAsset])).toBe(true);
        expect(isMediaCreativeRound({ ...runFixture(), tasks: [{ id: "video", title: "视频", type: "video", status: "running" }] }, [])).toBe(true);
        expect(isMediaCreativeRound({ ...runFixture(), generationPreferences: { mode: "audio" } }, [])).toBe(true);
    });

    it("leaves text-only runs in chat layout", () => {
        expect(isMediaCreativeRound({ ...runFixture(), tasks: [{ id: "text", title: "文章", type: "text", status: "completed" }] }, [])).toBe(false);
    });
});

function runFixture(): CreativeAgentRun {
    return {
        id: "run-one",
        conversationId: "conversation-one",
        inputMessageId: "user-one",
        assistantMessageId: "assistant-one",
        status: "completed",
        assetIds: [],
        tasks: [],
    };
}
