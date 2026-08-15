import { describe, expect, it } from "vitest";

import { createConversationHref, createConversationIdFromSearch, latestResumableAgentRun } from "./create-conversation-navigation";

describe("create conversation navigation", () => {
    it("creates a safe deep link and restores its conversation id", () => {
        const href = createConversationHref("conversation / one");

        expect(href).toBe("/create?conversationId=conversation+%2F+one");
        expect(createConversationIdFromSearch(href.split("?")[1])).toBe("conversation / one");
    });

    it("ignores empty conversation ids", () => {
        expect(createConversationIdFromSearch("?conversationId=%20%20")).toBe("");
    });

    it("selects the newest resumable Agent conversation", () => {
        const run = latestResumableAgentRun([
            { conversationId: "completed", status: "completed", updatedAt: 30 },
            { conversationId: "older", status: "running", updatedAt: 10 },
            { conversationId: "newer", status: "paused", updatedAt: 20 },
        ]);

        expect(run?.conversationId).toBe("newer");
    });
});
