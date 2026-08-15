import { isGenerationTaskNeedsReviewError } from "@/services/api/generation-task-state";
import { VideoGenerationUpstreamError } from "@/services/api/video-types";

export type CanvasVideoTaskFailureKind = "needs_review" | "upstream_failed" | "query_pending";

export function classifyCanvasVideoTaskFailure(error: unknown): CanvasVideoTaskFailureKind {
    if (isGenerationTaskNeedsReviewError(error)) return "needs_review";
    return error instanceof VideoGenerationUpstreamError ? "upstream_failed" : "query_pending";
}
