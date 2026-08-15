"use client";

import { Button, Tag } from "antd";
import { CircleDollarSign, Database, PlugZap, RefreshCw, UsersRound } from "lucide-react";

import { generationKindLabel, generationSourceLabel } from "@/components/admin/admin-generation-log";
import { AdminCommerceConversionPanel } from "@/components/admin/admin-commerce-conversion-panel";
import { Metric, Panel, PanelHeader } from "@/components/admin/admin-panel";
import { formatAdminMoney } from "@/components/admin/admin-values";
import type { AdminBillingSummary } from "@/lib/admin-billing-types";
import type { AdminGenerationOverviewSummary } from "@/lib/admin-generation-overview";
import type { SystemModelChannel } from "@/lib/auth/store";
import type { GenerationAssetStats, StoredGenerationLog } from "@/lib/server/generation-log-store";

type OverviewStats = { total: number; active: number; admins: number };
type SettingsSummary = { totalChannels: number; enabledChannels: number };
type WalletSummary = { enabledPlans: number; usersWithPlan: number };
type DistributionItem = { label: string; value: number; percent: number };
type OperationsSummary = AdminGenerationOverviewSummary;
type AdminOverviewProps = {
    stats: OverviewStats;
    settingsSummary: SettingsSummary;
    walletSummary: WalletSummary;
    billingSummary: AdminBillingSummary | null;
    operationsSummary: OperationsSummary;
    promptCount: number;
    assetStats: GenerationAssetStats | null;
    enabledProducts: number;
    billingLoading: boolean;
    loading: boolean;
    onRefreshBilling: () => Promise<void>;
    onRefresh: () => void;
};

export function AdminOverview({ stats, settingsSummary, walletSummary, billingSummary, operationsSummary, promptCount, assetStats, enabledProducts, billingLoading, loading, onRefreshBilling, onRefresh }: AdminOverviewProps) {
    return (
        <div className="space-y-3 sm:space-y-5">
            <section className="admin-metric-grid grid grid-cols-2 overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950 xl:grid-cols-4">
                <Metric label="用户总数" value={stats.total} detail={stats.active + " 个可用账号"} icon={<UsersRound className="size-5" />} tone="slate" />
                <Metric label="接口配置" value={settingsSummary.enabledChannels} detail={"共 " + settingsSummary.totalChannels + " 个渠道"} icon={<PlugZap className="size-5" />} tone="emerald" />
                <Metric label="实收金额" value={formatAdminMoney(billingSummary?.orders.paidAmountCents || 0)} detail={(billingSummary?.orders.paid || 0) + " 笔已支付订单"} icon={<CircleDollarSign className="size-5" />} tone="slate" />
                <Metric label="今日调用" value={operationsSummary.dailyCalls.at(-1)?.value || 0} detail={`近 ${operationsSummary.windowDays} 日 ${operationsSummary.totalCalls} 次调用`} icon={<Database className="size-5" />} tone="slate" />
            </section>
            <AdminCommerceConversionPanel billingSummary={billingSummary} billingLoading={billingLoading} onRefreshBilling={onRefreshBilling} />
            <Panel>
                <PanelHeader
                    title="平台运营拆分"
                    description="把用户、收入、模型能力和初始化进度放在同一张运营看板里，方便按商业后台的方式巡检。"
                    actions={
                        <div className="flex flex-wrap justify-end gap-2">
                            <Tag className="m-0">管理员 {stats.admins}</Tag>
                            <Tag className="m-0">提示词 {promptCount}</Tag>
                            <Tag className="m-0">资源 {assetStats ? assetStats.totalFiles : "-"}</Tag>
                        </div>
                    }
                />
                <div className="admin-resource-grid grid grid-cols-2 lg:grid-cols-4">
                    <ResourceStat label="成功调用" value={operationsSummary.successCalls + " 次"} detail={"成功率 " + operationsSummary.successRate + "%"} />
                    <ResourceStat label="活跃用户" value={operationsSummary.activeUsers + " 人"} detail={`近 ${operationsSummary.windowDays} 日去重用户`} />
                    <ResourceStat label="上架商品" value={enabledProducts + " 个"} detail={walletSummary.enabledPlans + " 个在售套餐"} />
                    <ResourceStat label="本地预览资源" value={assetStats ? assetStats.totalFiles + " 个" : "-"} detail={assetStats ? formatBytes(assetStats.totalBytes) : "等待统计"} />
                </div>
            </Panel>
            <div className="grid gap-3 sm:gap-5 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                <ModelDistributionPanel items={operationsSummary.modelDistribution} emptyText="暂无模型请求记录" />
                <UsageLinePanel items={operationsSummary.dailyCalls} loading={loading} onRefresh={onRefresh} />
            </div>
            <div className="grid gap-3 sm:gap-5 lg:grid-cols-2">
                <CompactDonutPanel title="入口分布" description="查看调用来自创作 Agent、画布、短剧或其他生成入口。" items={operationsSummary.sourceDistribution} emptyText="暂无入口记录" totalLabel="入口请求" />
                <CompactDonutPanel title="内容类型分布" description="对图片、视频等生成类型做运营观察。" items={operationsSummary.kindDistribution} emptyText="暂无类型记录" totalLabel="类型请求" />
            </div>
            <Panel>
                <PanelHeader title="业务健康" description="商业化后台首页只放运营判断相关信息；媒体文件维护已归入本地媒体页面。" />
                <div className="admin-resource-grid grid grid-cols-2 lg:grid-cols-4">
                    <ResourceStat label="在售套餐" value={walletSummary.enabledPlans + " 个"} detail={walletSummary.usersWithPlan + " 个套餐用户"} />
                    <ResourceStat label="启用模型渠道" value={settingsSummary.enabledChannels + " 个"} detail={"共 " + settingsSummary.totalChannels + " 个渠道"} />
                    <ResourceStat label="失败调用" value={operationsSummary.failedCalls + " 次"} detail="用于排查模型、额度或上游异常" />
                    <ResourceStat label="资源异常" value={assetStats ? assetStats.missingReferences + " 个" : "-"} detail="日志记录存在但文件不存在" />
                </div>
            </Panel>
        </div>
    );
}
function ModelDistributionPanel({ items, emptyText }: { items: DistributionItem[]; emptyText: string }) {
    const displayItems = items.length ? items : [{ label: emptyText, value: 0, percent: 100 }];
    return (
        <Panel>
            <PanelHeader title="模型分布" description="统计近 7 日不同模型的请求占比，便于调整默认模型和套餐成本。" />
            <div className="grid gap-3 p-3 sm:gap-6 sm:p-5 lg:grid-cols-[220px_minmax(0,1fr)]">
                <div className="flex items-center justify-center">
                    <DonutChart items={items} emptyText={emptyText} totalLabel="请求总量" variant="large" />
                </div>
                <div className="min-w-0 overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-800">
                    <div className="grid grid-cols-[minmax(0,1.2fr)_58px_58px] border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-[10px] font-semibold text-zinc-500 sm:grid-cols-[minmax(0,1.2fr)_72px_72px] sm:px-4 sm:py-2.5 sm:text-[11px] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                        <span>模型</span>
                        <span className="text-right">请求</span>
                        <span className="text-right">占比</span>
                    </div>
                    {displayItems.map((item, index) => (
                        <div
                            key={item.label}
                            className="grid grid-cols-[minmax(0,1.2fr)_58px_58px] items-center border-b border-zinc-100 px-3 py-2.5 text-xs last:border-b-0 sm:grid-cols-[minmax(0,1.2fr)_72px_72px] sm:px-4 sm:py-3 sm:text-sm dark:border-zinc-800/70"
                        >
                            <div className="flex min-w-0 items-center gap-2">
                                <span className={`size-2.5 shrink-0 rounded-full ${items.length ? "" : "bg-stone-300 dark:bg-stone-700"}`} style={items.length ? { background: chartColor(index) } : undefined} />
                                <span className={`min-w-0 truncate font-medium ${items.length ? "text-stone-900 dark:text-stone-100" : "text-stone-500 dark:text-stone-400"}`}>{item.label}</span>
                            </div>
                            <span className="text-right tabular-nums text-stone-500 dark:text-stone-400">{formatCompactNumber(item.value)}</span>
                            <span className="text-right tabular-nums font-semibold text-stone-950 dark:text-stone-100">{items.length ? `${item.percent}%` : "-"}</span>
                        </div>
                    ))}
                </div>
            </div>
        </Panel>
    );
}

function CompactDonutPanel({ title, description, items, emptyText, totalLabel }: { title: string; description: string; items: DistributionItem[]; emptyText: string; totalLabel: string }) {
    const displayItems = items.length ? items : [{ label: emptyText, value: 0, percent: 100 }];
    return (
        <Panel>
            <PanelHeader title={title} description={description} />
            <div className="grid gap-3 p-3 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-5 sm:p-5">
                <div className="flex items-center justify-center">
                    <DonutChart items={items} emptyText={emptyText} totalLabel={totalLabel} variant="compact" />
                </div>
                <div className="min-w-0 self-center">
                    {displayItems.map((item, index) => (
                        <div key={item.label} className="min-w-0 border-b border-zinc-100 px-1 py-3 last:border-b-0 dark:border-zinc-800">
                            <div className="flex items-center justify-between gap-3 text-sm">
                                <span className="flex min-w-0 items-center gap-2">
                                    <span className={`size-2.5 shrink-0 rounded-full ${items.length ? "" : "bg-stone-300 dark:bg-stone-700"}`} style={items.length ? { background: chartColor(index) } : undefined} />
                                    <span className={`min-w-0 truncate font-medium ${items.length ? "text-stone-900 dark:text-stone-100" : "text-stone-500 dark:text-stone-400"}`}>{item.label}</span>
                                </span>
                                <span className="shrink-0 tabular-nums font-semibold text-stone-950 dark:text-stone-100">{items.length ? `${item.percent}%` : "-"}</span>
                            </div>
                            <div className="mt-2 text-xs tabular-nums text-stone-500 dark:text-stone-400">{formatCompactNumber(item.value)} 次</div>
                        </div>
                    ))}
                </div>
            </div>
        </Panel>
    );
}

const donutChartVariants = {
    large: { sizeClass: "size-40 sm:size-56", viewBoxSize: 160, radius: 58, strokeWidth: 22, totalClassName: "text-xl sm:text-3xl", labelClassName: "text-[10px] sm:text-xs" },
    compact: { sizeClass: "size-32 sm:size-44", viewBoxSize: 150, radius: 54, strokeWidth: 20, totalClassName: "text-lg sm:text-2xl", labelClassName: "text-[10px] sm:text-[11px]" },
} as const;

function DonutChart({ items, emptyText, totalLabel, variant }: { items: DistributionItem[]; emptyText: string; totalLabel: string; variant: keyof typeof donutChartVariants }) {
    const { sizeClass, viewBoxSize, radius, strokeWidth, totalClassName, labelClassName } = donutChartVariants[variant];
    const total = items.reduce((sum, item) => sum + item.value, 0);
    const displayItems = items.length ? items : [{ label: emptyText, value: 0, percent: 100 }];
    const center = viewBoxSize / 2;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    return (
        <div className={`relative ${sizeClass}`}>
            <svg className="size-full -rotate-90" viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`} aria-hidden="true">
                <circle cx={center} cy={center} r={radius} fill="none" stroke="currentColor" className="text-stone-100 dark:text-stone-800" style={{ color: "var(--admin-chart-track)" }} strokeWidth={strokeWidth} />
                {displayItems.map((item, index) => {
                    const dash = items.length ? (item.value / Math.max(1, total)) * circumference : circumference;
                    const segment = (
                        <circle
                            key={item.label}
                            cx={center}
                            cy={center}
                            r={radius}
                            fill="none"
                            stroke="currentColor"
                            className={items.length ? "" : "text-stone-200 dark:text-stone-800"}
                            style={items.length ? { color: chartColor(index) } : undefined}
                            strokeWidth={strokeWidth}
                            strokeDasharray={`${dash} ${Math.max(0, circumference - dash)}`}
                            strokeDashoffset={-offset}
                            strokeLinecap="round"
                        />
                    );
                    offset += dash;
                    return segment;
                })}
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                    <div className={`${totalClassName} font-semibold tracking-normal text-stone-950 dark:text-stone-100`}>{formatCompactNumber(total)}</div>
                    <div className={`mt-1 ${labelClassName} text-stone-500 dark:text-stone-400`}>{totalLabel}</div>
                </div>
            </div>
        </div>
    );
}

function UsageLinePanel({ items, loading, onRefresh }: { items: Array<{ label: string; value: number }>; loading: boolean; onRefresh: () => void }) {
    const max = Math.max(1, ...items.map((item) => item.value));
    const width = 640;
    const height = 240;
    const paddingX = 32;
    const paddingY = 26;
    const plotWidth = width - paddingX * 2;
    const plotHeight = height - paddingY * 2;
    const points = items.map((item, index) => {
        const x = paddingX + (items.length <= 1 ? plotWidth : (index / (items.length - 1)) * plotWidth);
        const y = paddingY + plotHeight - (item.value / max) * plotHeight;
        return { ...item, x, y };
    });
    const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
    const area = points.length ? `${paddingX},${paddingY + plotHeight} ${polyline} ${paddingX + plotWidth},${paddingY + plotHeight}` : "";
    return (
        <Panel>
            <PanelHeader
                title="调用趋势"
                description="近 7 日用户调用曲线，辅助判断增长、异常波动和接口稳定性。"
                actions={
                    <Button loading={loading} icon={<RefreshCw className="size-4" />} onClick={onRefresh}>
                        刷新趋势
                    </Button>
                }
            />
            <div className="p-3 sm:p-5">
                <div>
                    <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-stone-500 sm:mb-4 dark:text-stone-400">
                        <span className="inline-flex items-center gap-1.5">
                            <span className="size-2.5 rounded-full" style={{ background: "var(--admin-chart-1)" }} />
                            请求量
                        </span>
                        <span>峰值 {formatCompactNumber(max)}</span>
                        {loading ? <Tag className="m-0">加载中</Tag> : null}
                    </div>
                    <svg className="h-44 w-full overflow-visible sm:h-72" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
                        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                            const y = paddingY + ratio * plotHeight;
                            return <line key={ratio} x1={paddingX} x2={paddingX + plotWidth} y1={y} y2={y} className="stroke-stone-200 dark:stroke-stone-800" strokeWidth="1" />;
                        })}
                        {area ? <polygon points={area} style={{ fill: "var(--admin-chart-area)" }} /> : null}
                        {polyline ? <polyline points={polyline} fill="none" style={{ stroke: "var(--admin-chart-1)" }} strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" /> : null}
                        {points.map((point) => (
                            <circle key={point.label} cx={point.x} cy={point.y} r="5" className="fill-white dark:fill-stone-950" style={{ stroke: "var(--admin-chart-1)" }} strokeWidth="3" />
                        ))}
                    </svg>
                    <div className="mt-3 grid grid-cols-7 gap-2 text-center text-[11px] text-stone-400">
                        {items.map((item) => (
                            <div key={item.label} className="min-w-0">
                                <div className="truncate">{item.label}</div>
                                <div className="mt-1 font-semibold tabular-nums text-stone-700 dark:text-stone-300">{item.value}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Panel>
    );
}

function ResourceStat({ label, value, detail }: { label: string; value: string; detail: string }) {
    return (
        <div className="admin-resource-stat min-w-0 p-2.5 sm:p-5">
            <div className="text-[10px] font-medium text-zinc-500 sm:text-[11px] dark:text-zinc-400">{label}</div>
            <div className="mt-1 truncate text-base font-semibold tabular-nums text-zinc-950 sm:mt-2 sm:text-lg dark:text-zinc-100">{value}</div>
            <div className="mt-0.5 truncate text-[10px] text-zinc-400 sm:mt-1 sm:text-[11px] dark:text-zinc-500">{detail}</div>
        </div>
    );
}

export function buildOperationsSummary(logs: StoredGenerationLog[], channels: SystemModelChannel[]) {
    const totalCalls = logs.length;
    const successCalls = logs.filter((log) => log.status === "success").length;
    const failedCalls = logs.filter((log) => log.status === "failed").length;
    const activeUsers = new Set(logs.map((log) => log.userId).filter(Boolean)).size;
    const today = new Date();
    const dayItems = Array.from({ length: 7 }).map((_, offset) => {
        const date = new Date(today);
        date.setDate(today.getDate() - (6 - offset));
        const key = date.toISOString().slice(0, 10);
        const label = date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
        return { key, label, value: 0 };
    });
    const dayMap = new Map(dayItems.map((item) => [item.key, item]));
    for (const log of logs) {
        const key = new Date(log.createdAt).toISOString().slice(0, 10);
        const item = dayMap.get(key);
        if (item) item.value += 1;
    }
    const knownModels = new Set(channels.flatMap((channel) => channel.models));
    const modelDistribution = distributionFromValues(
        logs.map((log) => log.model || "未记录模型"),
        (value) => (knownModels.has(value) ? value : value || "未记录模型"),
    );
    const sourceDistribution = distributionFromValues(logs.map((log) => generationSourceLabel(log.source)));
    const kindDistribution = distributionFromValues(logs.map((log) => generationKindLabel(log.kind)));
    return {
        totalCalls,
        successCalls,
        failedCalls,
        activeUsers,
        successRate: totalCalls ? Math.round((successCalls / totalCalls) * 100) : 0,
        dailyCalls: dayItems.map(({ label, value }) => ({ label, value })),
        modelDistribution,
        sourceDistribution,
        kindDistribution,
    };
}

function distributionFromValues(values: string[], normalize: (value: string) => string = (value) => value) {
    const counts = new Map<string, number>();
    for (const value of values) {
        const label = normalize(value).trim() || "未记录";
        counts.set(label, (counts.get(label) || 0) + 1);
    }
    const total = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
    return Array.from(counts.entries())
        .map(([label, value]) => ({ label, value, percent: total ? Math.round((value / total) * 100) : 0 }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);
}

function formatCompactNumber(value: number) {
    const numberValue = Number(value || 0);
    if (numberValue >= 100000000) return `${trimFixed(numberValue / 100000000, 2)}亿`;
    if (numberValue >= 10000) return `${trimFixed(numberValue / 10000, 1)}万`;
    return `${numberValue}`;
}

function trimFixed(value: number, digits: number) {
    return value
        .toFixed(digits)
        .replace(/\.0+$/, "")
        .replace(/(\.\d*[1-9])0+$/, "$1");
}

function chartColor(index: number) {
    return `var(--admin-chart-${(index % 6) + 1})`;
}

function formatBytes(value: number) {
    if (!value) return "0 B";
    const units = ["B", "KB", "MB", "GB"] as const;
    let size = value;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }
    return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}
