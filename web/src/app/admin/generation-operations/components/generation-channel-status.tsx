"use client";

import { Input, Tag, Tooltip } from "antd";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { Panel, PanelHeader } from "@/components/admin/admin-panel";
import { groupAdminGenerationChannels, type AdminGenerationChannel } from "@/lib/admin-generation-operations";
import { planningProtocolLabel } from "./generation-operation-task-details";
import { generationOperationThemeClasses } from "./generation-operations-theme";

export function GenerationChannelStatus({ channels, loading }: { channels: AdminGenerationChannel[]; loading: boolean }) {
    const [search, setSearch] = useState("");
    const groups = useMemo(() => groupAdminGenerationChannels(channels, search), [channels, search]);
    const emptyLabel = search.trim() ? "没有匹配渠道、逻辑模型或上游模型" : "暂无渠道绑定";

    return (
        <Panel>
            <PanelHeader title="渠道运行状态" description="按能力和渠道归组，优先显示冷却、停用与运行异常；数据来自真实业务请求。" />
            <section className="border-b border-zinc-200 bg-zinc-50/70 p-3 dark:border-zinc-800 dark:bg-zinc-900/40 sm:p-4">
                <Input allowClear value={search} prefix={<Search className="size-4 text-zinc-400" />} placeholder="搜索渠道名 / ID、逻辑模型或上游模型" aria-label="搜索渠道运行状态" onChange={(event) => setSearch(event.target.value)} />
            </section>
            <section className="space-y-5 p-3 sm:p-4">
                {groups.map((group) => (
                    <section key={group.capability} aria-labelledby={`channel-group-${group.capability}`}>
                        <div className="mb-2.5 flex items-center gap-2">
                            <h3 id={`channel-group-${group.capability}`} className="text-sm font-semibold text-zinc-950 dark:text-zinc-100">
                                {capabilityLabel(group.capability)}能力
                            </h3>
                            <span className="text-xs text-zinc-400 dark:text-zinc-500">{group.channels.length} 个渠道</span>
                        </div>
                        <div className="grid gap-3 lg:grid-cols-2">
                            {group.channels.map((channel) => {
                                const error = channel.bindings.find((binding) => binding.runtimeHealth.lastError)?.runtimeHealth.lastError;
                                return (
                                    <article key={`${group.capability}:${channel.id}`} className="min-w-0 rounded-lg border border-zinc-200 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-950">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-100">{channel.name}</span>
                                                {channel.cooling ? <Tag className={generationOperationThemeClasses.reviewTag}>冷却中</Tag> : null}
                                                {channel.disabledBindings ? <Tag className={generationOperationThemeClasses.neutralTag}>{channel.disabledBindings === channel.bindings.length ? "已停用" : `${channel.disabledBindings} 项停用`}</Tag> : null}
                                                {!channel.cooling && channel.consecutiveFailures ? <Tag className={generationOperationThemeClasses.reviewTag}>最近异常</Tag> : null}
                                            </div>
                                            <Tooltip title={channel.id}>
                                                <div className="mt-1 truncate font-mono text-[11px] text-zinc-400 dark:text-zinc-500">{channel.id}</div>
                                            </Tooltip>
                                        </div>
                                        {error ? <div className="mt-3 line-clamp-2 text-xs leading-5 text-amber-700 dark:text-amber-300">{error}</div> : null}
                                        <div className="mt-3 divide-y divide-zinc-100 border-t border-zinc-100 dark:divide-zinc-900 dark:border-zinc-900">
                                            {channel.bindings.map((binding) => (
                                                <div key={`${binding.logicalModelId}:${binding.upstreamModel}`} className="py-3 last:pb-0">
                                                    <div className="flex min-w-0 items-center justify-between gap-2">
                                                        <Tooltip title={`${binding.logicalModelId} → ${binding.upstreamModel}`}>
                                                            <div className="min-w-0 truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                                                {binding.logicalModelName} → {binding.upstreamModel}
                                                            </div>
                                                        </Tooltip>
                                                        {!binding.enabled ? <Tag className={generationOperationThemeClasses.neutralTag}>绑定停用</Tag> : null}
                                                    </div>
                                                    <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                                                        {binding.planningRuntime
                                                            ? `规划 ${planningProtocolLabel(binding.planningRuntime.protocol)} · 平均 ${formatDuration(binding.planningRuntime.averageLatencyMs || 0)} · ${binding.planningRuntime.successCount} 成功 / ${binding.planningRuntime.failureCount} 失败`
                                                            : "暂无规划调用样本"}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </section>
                ))}
                {!loading && !groups.length ? <div className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">{emptyLabel}</div> : null}
                {loading && !channels.length ? <div className="py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">正在加载渠道状态…</div> : null}
            </section>
        </Panel>
    );
}

function capabilityLabel(capability: AdminGenerationChannel["capability"]) {
    return ({ text: "文本", image: "图片", video: "视频", audio: "音频" } as const)[capability];
}

function formatDuration(ms: number) {
    if (!ms) return "0 秒";
    return ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} 秒` : `${Math.floor(ms / 60_000)} 分 ${Math.round((ms % 60_000) / 1000)} 秒`;
}
