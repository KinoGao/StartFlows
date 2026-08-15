import type { AdminGenerationOverviewDistribution, AdminGenerationOverviewSummary } from "@/lib/admin-generation-overview";
import { createPostgresRepositories, ensurePostgresSchema, isPostgresDatabaseEnabled } from "@/lib/server/database";
import type { GenerationLogOverviewAggregate, GenerationLogOverviewBucket } from "@/lib/server/database/content-repository";
import { kindLabel, readGenerationLogDb, sourceLabel } from "@/lib/server/generation-log-repository";
import type { StoredGenerationLog } from "@/lib/server/generation-log-types";

const OVERVIEW_DAYS = 7;
const OVERVIEW_TIME_ZONE = "Asia/Shanghai";
const OVERVIEW_UTC_OFFSET = "+08:00";

export async function getAdminGenerationOverviewSummary(now = new Date()): Promise<AdminGenerationOverviewSummary> {
    const window = generationOverviewWindow(now);
    if (isPostgresDatabaseEnabled()) {
        await ensurePostgresSchema();
        const aggregate = await createPostgresRepositories().generationLogs.getOverviewAggregate({ startAt: window.startAt, endAt: window.endAt, timeZone: OVERVIEW_TIME_ZONE });
        return generationOverviewSummary(aggregate, window.dates);
    }
    const db = await readGenerationLogDb();
    return buildAdminGenerationOverviewSummary(db.logs, now);
}

export function buildAdminGenerationOverviewSummary(logs: StoredGenerationLog[], now = new Date()) {
    const window = generationOverviewWindow(now);
    return generationOverviewSummary(aggregateGenerationLogs(logs, window), window.dates);
}

export function generationOverviewWindow(now: Date) {
    const endDate = shanghaiDateKey(now);
    const dates = Array.from({ length: OVERVIEW_DAYS }, (_, index) => addDateDays(endDate, index - (OVERVIEW_DAYS - 1)));
    return {
        dates,
        startAt: new Date(`${dates[0]}T00:00:00${OVERVIEW_UTC_OFFSET}`).toISOString(),
        endAt: new Date(`${addDateDays(endDate, 1)}T00:00:00${OVERVIEW_UTC_OFFSET}`).toISOString(),
    };
}

function aggregateGenerationLogs(logs: StoredGenerationLog[], window: ReturnType<typeof generationOverviewWindow>): GenerationLogOverviewAggregate {
    const start = Date.parse(window.startAt);
    const end = Date.parse(window.endAt);
    const scoped = logs.filter((log) => {
        const createdAt = Date.parse(log.createdAt);
        return Number.isFinite(createdAt) && createdAt >= start && createdAt < end;
    });
    return {
        totalCalls: scoped.length,
        successCalls: scoped.filter((log) => log.status === "success").length,
        failedCalls: scoped.filter((log) => log.status === "failed").length,
        activeUsers: new Set(scoped.map((log) => log.userId).filter(Boolean)).size,
        daily: countBuckets(scoped, (log) => shanghaiDateKey(new Date(log.createdAt))),
        models: countBuckets(scoped, (log) => log.model.trim() || "未记录模型").slice(0, 6),
        sources: countBuckets(scoped, (log) => log.source),
        kinds: countBuckets(scoped, (log) => log.kind),
    };
}

function generationOverviewSummary(aggregate: GenerationLogOverviewAggregate, dates: string[]): AdminGenerationOverviewSummary {
    const daily = new Map(aggregate.daily.map((item) => [item.key, item.value]));
    return {
        windowDays: OVERVIEW_DAYS,
        totalCalls: aggregate.totalCalls,
        successCalls: aggregate.successCalls,
        failedCalls: aggregate.failedCalls,
        activeUsers: aggregate.activeUsers,
        successRate: aggregate.totalCalls ? Math.round((aggregate.successCalls / aggregate.totalCalls) * 100) : 0,
        dailyCalls: dates.map((date) => ({ date, label: date.slice(5).replace("-", "/"), value: daily.get(date) || 0 })),
        modelDistribution: distribution(aggregate.models, (key) => key, aggregate.totalCalls),
        sourceDistribution: distribution(aggregate.sources, sourceLabel, aggregate.totalCalls),
        kindDistribution: distribution(aggregate.kinds, kindLabel, aggregate.totalCalls),
    };
}

function countBuckets<T>(items: T[], keyOf: (item: T) => string): GenerationLogOverviewBucket[] {
    const counts = new Map<string, number>();
    for (const item of items) {
        const key = keyOf(item).trim() || "未记录";
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts, ([key, value]) => ({ key, value })).sort((left, right) => right.value - left.value || left.key.localeCompare(right.key, "zh-CN"));
}

function distribution(items: GenerationLogOverviewBucket[], labelOf: (key: string) => string, total: number): AdminGenerationOverviewDistribution[] {
    return items.slice(0, 6).map((item) => ({ label: labelOf(item.key), value: item.value, percent: total ? Math.round((item.value / total) * 100) : 0 }));
}

function shanghaiDateKey(date: Date) {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: OVERVIEW_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
    const values = new Map(parts.map((part) => [part.type, part.value]));
    return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

function addDateDays(date: string, days: number) {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
