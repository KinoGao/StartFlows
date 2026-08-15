import { describe, expect, it, vi } from "vitest";

import { finishGenerationAttempt, startGenerationAttempt } from "./generation-attempt";

describe("generation attempts", () => {
    it("keeps a stable ordered history across channel fallback", () => {
        vi.spyOn(Date, "now").mockReturnValueOnce(100).mockReturnValueOnce(200).mockReturnValueOnce(300).mockReturnValueOnce(400);
        const first = startGenerationAttempt([], { channelId: "primary", model: "writer" });
        const failed = finishGenerationAttempt(first.attempts, first.attempt.attemptNo, { status: "failed", error: "timeout" });
        const second = startGenerationAttempt(failed, { channelId: "backup", model: "writer" });
        const completed = finishGenerationAttempt(second.attempts, second.attempt.attemptNo, { status: "succeeded", pointsCost: 2 });

        expect(completed).toEqual([expect.objectContaining({ attemptNo: 1, channelId: "primary", status: "failed", error: "timeout" }), expect.objectContaining({ attemptNo: 2, channelId: "backup", status: "succeeded", pointsCost: 2 })]);
        vi.restoreAllMocks();
    });
});
