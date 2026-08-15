import { describe, expect, it } from "vitest";

import type { CreativeAgentRun } from "@/services/api/creative";

import { creativeRunReplayPreferences } from "./creative-run-replay";

describe("creativeRunReplayPreferences", () => {
    it("preserves the actual image task count for edit and regenerate", () => {
        expect(creativeRunReplayPreferences(run({ generationPreferences: { image: { size: "1:1", quality: "high" } }, tasks: [task("image", 4)] }))).toEqual({ image: { size: "1:1", quality: "high", count: 4 } });
    });

    it("preserves the actual video batch count for edit and regenerate", () => {
        const preferences = { mode: "video" as const, video: { size: "16:9", seconds: 5 } };
        expect(creativeRunReplayPreferences(run({ generationPreferences: preferences, tasks: [task("video", 3)] }))).toEqual({ mode: "video", video: { size: "16:9", seconds: 5, count: 3 } });
    });

    it("keeps image and video counts separate in a mixed Agent run", () => {
        const preferences = { image: { quality: "high" as const }, video: { seconds: 5 } };
        expect(creativeRunReplayPreferences(run({ generationPreferences: preferences, tasks: [task("image", 2), task("video", 4)] }))).toEqual({ image: { quality: "high", count: 2 }, video: { seconds: 5, count: 4 } });
    });
});

function run(patch: Partial<CreativeAgentRun>): CreativeAgentRun {
    return { id: "run-one", conversationId: "conversation-one", inputMessageId: "user-one", assistantMessageId: "assistant-one", status: "completed", assetIds: [], tasks: [], ...patch };
}

function task(type: "image" | "video", count: number): CreativeAgentRun["tasks"][number] {
    return { id: `${type}-one`, title: type, type, count, status: "completed" };
}
