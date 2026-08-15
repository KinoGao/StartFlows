import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getProject: vi.fn(), summarizeCosts: vi.fn() }));

vi.mock("@/lib/server/drama-project-service", () => ({ getDramaProjectForUser: mocks.getProject }));
vi.mock("@/lib/server/generation-task-store", () => ({ summarizeStoredGenerationTaskCosts: mocks.summarizeCosts }));

import { getDramaProjectCostSummary } from "./drama-project-cost-service";

describe("drama project cost summary", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getProject.mockResolvedValue({ id: "project-one" });
        mocks.summarizeCosts.mockResolvedValue([
            { type: "image", status: "success", taskCount: 1, estimatedPoints: 2, actualPoints: 1.5 },
            { type: "video", status: "success", taskCount: 1, estimatedPoints: 8, actualPoints: 7 },
            { type: "audio", status: "error", taskCount: 1, estimatedPoints: 1, actualPoints: 0 },
        ]);
    });

    it("aggregates only the current project and excludes refunded failures", async () => {
        await expect(getDramaProjectCostSummary("user-one", "project-one")).resolves.toEqual({
            estimatedPoints: 11,
            actualPoints: 8.5,
            taskCount: 3,
            successCount: 2,
            failedCount: 1,
            byType: {
                image: { tasks: 1, estimatedPoints: 2, actualPoints: 1.5 },
                video: { tasks: 1, estimatedPoints: 8, actualPoints: 7 },
                audio: { tasks: 1, estimatedPoints: 1, actualPoints: 0 },
            },
        });
        expect(mocks.summarizeCosts).toHaveBeenCalledWith({ userId: "user-one", projectId: "project-one", types: ["image", "video", "audio"] });
    });
});
