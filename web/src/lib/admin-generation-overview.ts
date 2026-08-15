export type AdminGenerationOverviewDistribution = {
    label: string;
    value: number;
    percent: number;
};

export type AdminGenerationOverviewSummary = {
    windowDays: number;
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    activeUsers: number;
    successRate: number;
    dailyCalls: Array<{ date: string; label: string; value: number }>;
    modelDistribution: AdminGenerationOverviewDistribution[];
    sourceDistribution: AdminGenerationOverviewDistribution[];
    kindDistribution: AdminGenerationOverviewDistribution[];
};

export function emptyAdminGenerationOverviewSummary(): AdminGenerationOverviewSummary {
    return {
        windowDays: 7,
        totalCalls: 0,
        successCalls: 0,
        failedCalls: 0,
        activeUsers: 0,
        successRate: 0,
        dailyCalls: [],
        modelDistribution: [],
        sourceDistribution: [],
        kindDistribution: [],
    };
}
