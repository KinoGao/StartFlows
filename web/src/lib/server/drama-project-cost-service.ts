import type { DramaCostSummary } from "@/lib/drama-project-contract";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { summarizeStoredGenerationTaskCosts } from "@/lib/server/generation-task-store";

export async function getDramaProjectCostSummary(userId: string, projectId: string): Promise<DramaCostSummary> {
    await getDramaProjectForUser(userId, projectId);
    const aggregates = await summarizeStoredGenerationTaskCosts({ userId, projectId, types: ["image", "video", "audio"] });
    const byType: DramaCostSummary["byType"] = {};
    let estimatedPoints = 0;
    let actualPoints = 0;
    for (const aggregate of aggregates) {
        const type = aggregate.type as "image" | "video" | "audio";
        estimatedPoints += aggregate.estimatedPoints;
        actualPoints += aggregate.actualPoints;
        const current = byType[type] || { tasks: 0, estimatedPoints: 0, actualPoints: 0 };
        byType[type] = {
            tasks: current.tasks + aggregate.taskCount,
            estimatedPoints: round(current.estimatedPoints + aggregate.estimatedPoints),
            actualPoints: round(current.actualPoints + aggregate.actualPoints),
        };
    }
    return {
        estimatedPoints: round(estimatedPoints),
        actualPoints: round(actualPoints),
        taskCount: aggregates.reduce((total, item) => total + item.taskCount, 0),
        successCount: aggregates.filter((item) => item.status === "success").reduce((total, item) => total + item.taskCount, 0),
        failedCount: aggregates.filter((item) => item.status === "error" || item.status === "cancelled").reduce((total, item) => total + item.taskCount, 0),
        byType,
    };
}

function round(value: number) {
    return Number(value.toFixed(2));
}
