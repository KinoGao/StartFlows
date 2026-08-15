"use client";

import { Input, Select } from "antd";
import { ArrowUpRight, BookOpenText, CircleHelp, Clapperboard, ImagePlus, Images, Maximize2, Rocket, Search, ShieldCheck, Sparkles, Video, WalletCards, Wrench, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import { findHelpArticle, helpArticles, searchHelpArticles, type HelpArticleId } from "./help-content";
import { HelpFaqList, HelpFlow, HelpGuideSteps } from "./help-elements";

const icons: Record<HelpArticleId, LucideIcon> = {
    start: Rocket,
    agent: Sparkles,
    image: ImagePlus,
    video: Video,
    canvas: Maximize2,
    drama: Clapperboard,
    assets: Images,
    prompts: BookOpenText,
    account: WalletCards,
    rights: ShieldCheck,
    troubleshooting: Wrench,
};

const iconStyles: Record<HelpArticleId, string> = {
    start: "bg-emerald-50 text-emerald-700 dark:bg-emerald-300/10 dark:text-emerald-300",
    agent: "bg-sky-50 text-sky-700 dark:bg-sky-300/10 dark:text-sky-300",
    image: "bg-rose-50 text-rose-700 dark:bg-rose-300/10 dark:text-rose-300",
    video: "bg-indigo-50 text-indigo-700 dark:bg-indigo-300/10 dark:text-indigo-300",
    canvas: "bg-cyan-50 text-cyan-700 dark:bg-cyan-300/10 dark:text-cyan-300",
    drama: "bg-amber-50 text-amber-700 dark:bg-amber-300/10 dark:text-amber-300",
    assets: "bg-teal-50 text-teal-700 dark:bg-teal-300/10 dark:text-teal-300",
    prompts: "bg-orange-50 text-orange-700 dark:bg-orange-300/10 dark:text-orange-300",
    account: "bg-violet-50 text-violet-700 dark:bg-violet-300/10 dark:text-violet-300",
    rights: "bg-blue-50 text-blue-700 dark:bg-blue-300/10 dark:text-blue-300",
    troubleshooting: "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
};

export default function HelpPage() {
    const [activeId, setActiveId] = useState<HelpArticleId>("start");
    const [query, setQuery] = useState("");
    const results = useMemo(() => searchHelpArticles(query), [query]);
    const activeArticle = findHelpArticle(activeId) || helpArticles[0];

    useEffect(() => {
        const requested = findHelpArticle(new URLSearchParams(window.location.search).get("section"));
        if (requested) setActiveId(requested.id);
    }, []);

    const selectArticle = (id: HelpArticleId) => {
        setActiveId(id);
        const url = new URL(window.location.href);
        url.searchParams.set("section", id);
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
        window.requestAnimationFrame(() => document.getElementById("help-article")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    };

    return (
        <div className="h-full min-h-0 overflow-y-auto bg-[#fafbfc] text-foreground dark:bg-[#111316]">
            <div className="mx-auto w-full max-w-[1480px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
                <header className="grid gap-4 border-b border-border pb-5 sm:pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] lg:items-end">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                            <CircleHelp className="size-4" /> 用户帮助中心
                        </div>
                        <h1 className="mt-2 text-2xl font-semibold text-foreground sm:text-3xl">从操作到交付，按真实流程完成创作</h1>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">选择一个任务，查看完整流程、逐步操作、结果处理和常见问题。</p>
                    </div>
                    <Input allowClear size="large" prefix={<Search className="size-4 text-muted-foreground" />} placeholder="搜索功能、按钮或问题" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="搜索帮助内容" />
                </header>

                {query.trim() ? (
                    <section className="border-b border-border py-4" aria-label="帮助搜索结果">
                        <div className="flex items-center justify-between gap-3">
                            <h2 className="text-sm font-semibold">搜索结果</h2>
                            <span className="text-xs text-muted-foreground">{results.length} 项</span>
                        </div>
                        {results.length ? (
                            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                                {results.map((article) => {
                                    const Icon = icons[article.id];
                                    return (
                                        <button
                                            key={article.id}
                                            type="button"
                                            className={cn(
                                                "flex min-w-0 items-start gap-3 rounded-lg border px-3 py-3 text-left transition",
                                                activeId === article.id
                                                    ? "!border-[#20242a] !bg-[#20242a] !text-white dark:!border-[#f3f5f7] dark:!bg-[#f3f5f7] dark:!text-[#20242a]"
                                                    : "border-border bg-card text-card-foreground hover:border-foreground/35 hover:bg-muted/60",
                                            )}
                                            onClick={() => selectArticle(article.id)}
                                        >
                                            <Icon className="mt-0.5 size-4 shrink-0" />
                                            <span className="min-w-0">
                                                <span className="block text-sm font-medium">{article.label}</span>
                                                <span className={cn("mt-1 line-clamp-2 block text-xs leading-5", activeId === article.id ? "text-background/70" : "text-muted-foreground")}>{article.summary}</span>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="mt-3 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">没有找到相关教程，尝试搜索“画布”“参考图”“订单”或“下载”。</div>
                        )}
                    </section>
                ) : null}

                <div className="grid min-w-0 gap-5 py-5 sm:py-6 lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-8">
                    <aside className="hidden lg:block">
                        <nav className="sticky top-4 space-y-1" aria-label="帮助分类">
                            {helpArticles.map((article) => {
                                const Icon = icons[article.id];
                                const active = article.id === activeId;
                                return (
                                    <button
                                        key={article.id}
                                        type="button"
                                        className={cn(
                                            "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition",
                                            active ? "!bg-[#20242a] !text-white font-medium dark:!bg-[#f3f5f7] dark:!text-[#20242a]" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                        )}
                                        onClick={() => selectArticle(article.id)}
                                        aria-current={active ? "page" : undefined}
                                    >
                                        <Icon className="size-4 shrink-0" />
                                        <span className="min-w-0 flex-1 truncate">{article.label}</span>
                                    </button>
                                );
                            })}
                        </nav>
                    </aside>

                    <main className="min-w-0">
                        <div className="mb-5 lg:hidden">
                            <label className="mb-2 block text-xs font-medium text-muted-foreground" htmlFor="help-mobile-section">
                                选择教程
                            </label>
                            <Select id="help-mobile-section" className="w-full" size="large" value={activeId} options={helpArticles.map((article) => ({ label: article.label, value: article.id }))} onChange={(value) => selectArticle(value)} />
                        </div>

                        <article id="help-article" className="min-w-0 scroll-mt-4">
                            <ArticleHeader article={activeArticle} />

                            <section className="mt-7 sm:mt-8">
                                <SectionHeading title="完整流程" description="先看清各阶段，再进入逐步操作。" />
                                <HelpFlow steps={activeArticle.flow} />
                            </section>

                            <section className="mt-8 sm:mt-10">
                                <SectionHeading title="详细教程" description="按顺序完成，每一步都包含检查项。" />
                                <HelpGuideSteps steps={activeArticle.steps} />
                            </section>

                            <section className="mt-8 pb-8 sm:mt-10 sm:pb-12">
                                <SectionHeading title="常见问题" description="优先按当前功能的真实状态处理。" />
                                <HelpFaqList faqs={activeArticle.faqs} />
                            </section>
                        </article>
                    </main>
                </div>
            </div>
        </div>
    );
}

function ArticleHeader({ article }: { article: (typeof helpArticles)[number] }) {
    const Icon = icons[article.id];
    return (
        <header className="border-b border-border pb-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", iconStyles[article.id])}>
                        <Icon className="size-5" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-xs font-medium text-muted-foreground">{article.label}</p>
                        <h2 className="mt-1 text-xl font-semibold text-foreground sm:text-2xl">{article.title}</h2>
                        <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">{article.summary}</p>
                    </div>
                </div>
                {article.route ? (
                    <Link
                        href={article.route.href}
                        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg !bg-[#20242a] px-3.5 text-sm font-medium !text-white transition hover:opacity-85 dark:!bg-[#f3f5f7] dark:!text-[#20242a]"
                    >
                        {article.route.label}
                        <ArrowUpRight className="size-3.5" />
                    </Link>
                ) : null}
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {article.outcomes.map((outcome) => (
                    <div key={outcome} className="flex min-w-0 items-start gap-2 border-l-2 border-border pl-3 text-xs leading-5 text-muted-foreground">
                        {outcome}
                    </div>
                ))}
            </div>
        </header>
    );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
    return (
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="text-xs text-muted-foreground">{description}</p>
        </div>
    );
}
