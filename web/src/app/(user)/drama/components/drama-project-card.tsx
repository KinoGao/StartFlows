"use client";

import { App, Button, Popconfirm, Tag, Tooltip } from "antd";
import { ArrowUpRight, Clapperboard, Share2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { DramaProjectSummary } from "../types";
import { useDramaStore } from "../stores/use-drama-store";

export function DramaProjectCard({ project }: { project: DramaProjectSummary }) {
    const router = useRouter();
    const { message } = App.useApp();
    const deleteProject = useDramaStore((state) => state.deleteProject);
    const pendingCount = project.pendingTaskCount;
    const failedCount = project.failedTaskCount;
    return (
        <article className="group relative rounded-lg border border-border bg-card p-3 text-card-foreground transition hover:-translate-y-px hover:border-foreground/25 hover:shadow-sm focus-within:border-foreground/35 focus-within:ring-2 focus-within:ring-ring/20 sm:p-3.5">
            <Link href={`/drama/${project.id}`} className="absolute inset-0 z-0 rounded-lg outline-none" aria-label={`进入短剧项目：${project.title}`}>
                <span className="sr-only">进入短剧项目：{project.title}</span>
            </Link>
            <div className="pointer-events-none relative z-[1] flex min-w-0 items-start gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-md bg-foreground text-background">
                    <Clapperboard className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[15px] font-semibold sm:text-base">{project.title}</h2>
                    <p className="mt-0.5 line-clamp-1 text-xs leading-5 text-muted-foreground">{project.summary || "还没有填写项目简介"}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                    {pendingCount ? (
                        <span className="inline-flex h-6 items-center rounded-md border border-amber-200 bg-amber-50 px-2 text-xs font-medium text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/35 dark:text-amber-300">{pendingCount} 执行中</span>
                    ) : null}
                    {failedCount ? (
                        <Tag color="error" className="m-0">
                            {failedCount} 失败
                        </Tag>
                    ) : null}
                    <Tag className="m-0">{project.ratio}</Tag>
                    <ArrowUpRight className="size-3.5 text-muted-foreground transition group-hover:text-foreground" />
                </div>
            </div>
            <div className="relative z-10 mt-2.5 flex min-w-0 items-center justify-between gap-2 border-t border-border pt-2.5">
                <div className="pointer-events-none min-w-0 truncate text-xs leading-5 text-muted-foreground">
                    {project.episodeCount} 集 · {project.characterCount} 角色 · {project.sceneCount} 场景 · {project.shotCount} 分镜
                </div>
                <div className="flex shrink-0 justify-end gap-1.5">
                    <Popconfirm title="删除这个短剧项目？" onConfirm={() => deleteProject(project.id).catch((error) => message.error(error instanceof Error ? error.message : "项目删除失败"))}>
                        <Tooltip title="删除项目">
                            <Button
                                type="text"
                                shape="circle"
                                className="!size-8 !text-muted-foreground hover:!bg-rose-50 hover:!text-rose-600 dark:hover:!bg-rose-950/30 dark:hover:!text-rose-300"
                                icon={<Trash2 className="size-3.5" />}
                                aria-label="删除项目"
                            />
                        </Tooltip>
                    </Popconfirm>
                    <Button className="!h-8 !px-2.5" icon={<Share2 className="size-3.5" />} onClick={() => router.push(`/works?sourceType=drama&sourceId=${encodeURIComponent(project.id)}`)}>
                        发布
                    </Button>
                </div>
            </div>
        </article>
    );
}
