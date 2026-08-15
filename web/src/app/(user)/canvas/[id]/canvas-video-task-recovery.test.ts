import { describe, expect, it } from "vitest";

import { GenerationTaskNeedsReviewError } from "@/services/api/generation-task-state";
import { VideoGenerationUpstreamError } from "@/services/api/video-types";
import { classifyCanvasVideoTaskFailure } from "./canvas-video-task-recovery";

describe("canvas video task recovery", () => {
    it("keeps human review separate from upstream terminal failures", () => {
        expect(classifyCanvasVideoTaskFailure(new GenerationTaskNeedsReviewError())).toBe("needs_review");
        expect(classifyCanvasVideoTaskFailure(new VideoGenerationUpstreamError("upstream failed"))).toBe("upstream_failed");
    });

    it("continues the original task after local query failures", () => {
        expect(classifyCanvasVideoTaskFailure(new Error("network unavailable"))).toBe("query_pending");
    });
});
