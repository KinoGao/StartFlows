"use client";

import { ArrowRight, GalleryVerticalEnd, Plus, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Select } from "antd";

import { PublicWorkPreviewModal } from "@/components/works/public-work-preview-modal";
import { PublicWorkGalleryCard } from "@/components/works/public-work-gallery-card";
import { PublicCreatorModal } from "@/components/works/public-creator-modal";
import { ResponsiveMasonryGrid } from "@/components/works/responsive-masonry-grid";
import { WORK_CATEGORY_OPTIONS } from "@/lib/work-publication-options";
import { cn } from "@/lib/utils";
import type { GalleryFilters, GalleryResult } from "./gallery-data";
import { GalleryPublishLink } from "./gallery-publish-link";

const controlClass = "h-10 min-w-0 rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-foreground/40";
const primaryLinkClass = "inline-flex h-9 items-center justify-center gap-2 rounded-md !bg-foreground px-4 text-sm font-medium !text-background transition hover:opacity-80";

export function GalleryView({ filters, gallery, basePath, embedded = false }: { filters: GalleryFilters; gallery: GalleryResult; basePath: string; embedded?: boolean }) {
    const filtered = hasFilters(filters);
    const [previewSlug, setPreviewSlug] = useState("");
    const [creatorUsername, setCreatorUsername] = useState("");
    const [sort, setSort] = useState(filters.sort);

    useEffect(() => setSort(filters.sort), [filters.sort]);
    return (
        <div className={cn("mx-auto w-full max-w-[1600px]", embedded ? "px-2 py-2 sm:px-6 sm:py-6" : "px-3 pb-10 pt-4 sm:px-6 sm:pb-16 sm:pt-6")}>
            <section className="flex min-w-0 items-center justify-between gap-3 pb-3 sm:pb-4">
                <h1 className="min-w-0 text-xl font-semibold sm:text-2xl">灵感发现</h1>
                {embedded ? (
                    <Link href="/works" className="inline-flex h-9 w-fit items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground transition hover:bg-muted">
                        <Plus className="size-4" />
                        管理我的作品
                    </Link>
                ) : null}
            </section>

            <nav className="flex min-w-0 gap-1 overflow-x-auto border-b border-border pb-2" aria-label="作品分类">
                <Link href={galleryFilterHref(basePath, filters, "")} className={categoryClass(!filters.category)}>
                    全部
                </Link>
                {WORK_CATEGORY_OPTIONS.map((option) => (
                    <Link key={option.value} href={galleryFilterHref(basePath, filters, option.value)} className={categoryClass(filters.category === option.value)}>
                        {option.label}
                    </Link>
                ))}
            </nav>

            <form className="grid min-w-0 grid-cols-2 gap-2 border-b border-border py-2.5 md:grid-cols-[minmax(220px,1fr)_140px_150px_auto_auto]" action={basePath}>
                <input type="hidden" name="category" value={filters.category} />
                <label className="relative col-span-2 min-w-0 md:col-span-1">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input name="keyword" defaultValue={filters.keyword} placeholder="搜索标题、说明或提示词" aria-label="搜索作品" className={cn(controlClass, "w-full pl-9 pr-3")} />
                </label>
                <input name="tag" defaultValue={filters.tag} placeholder="标签" aria-label="作品标签" className={controlClass} />
                <input type="hidden" name="sort" value={sort} />
                <Select
                    aria-label="作品排序"
                    className="w-full"
                    size="large"
                    value={sort}
                    options={[
                        { value: "random", label: "随机发现" },
                        { value: "featured", label: "精选优先" },
                        { value: "latest", label: "最新发布" },
                        { value: "popular", label: "最多访问" },
                        { value: "weekly", label: "本周热榜" },
                        { value: "monthly", label: "本月热榜" },
                    ]}
                    onChange={setSort}
                />
                <label className="flex h-10 min-w-0 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 text-sm text-foreground transition hover:bg-muted">
                    <input type="checkbox" name="featured" value="1" defaultChecked={filters.featured === "1"} className="size-4 accent-foreground" />
                    只看精选
                </label>
                <div className="col-span-2 flex min-w-0 items-center justify-end gap-2 md:col-span-1">
                    {filtered ? (
                        <Link href={basePath} className="inline-flex h-10 items-center justify-center rounded-md border border-border bg-card px-3 text-sm text-foreground transition hover:bg-muted">
                            清除
                        </Link>
                    ) : null}
                    <button className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-md !bg-foreground px-4 text-sm font-medium !text-background transition hover:opacity-80 md:flex-none" type="submit">
                        <Search className="size-4" />
                        筛选
                    </button>
                </div>
            </form>

            {gallery.error ? (
                <section className="grid min-h-48 place-items-center border-b border-dashed border-border px-4 text-center">
                    <div>
                        <p className="text-sm font-medium">作品广场暂时不可用</p>
                        <p className="mt-1 text-xs text-muted-foreground">{gallery.error}</p>
                    </div>
                </section>
            ) : gallery.items.length ? (
                <ResponsiveMasonryGrid className="grid-cols-2 py-3 sm:grid-cols-3 sm:py-4 md:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6" ariaLabel="作品列表">
                    {gallery.items.map((item) => (
                        <PublicWorkGalleryCard key={item.slug} item={item} nextPath={basePath} onOpen={() => setPreviewSlug(item.slug)} onOpenAuthor={setCreatorUsername} />
                    ))}
                </ResponsiveMasonryGrid>
            ) : (
                <section className="flex min-h-64 flex-col items-center justify-center border-b border-dashed border-border px-4 py-10 text-center sm:min-h-80">
                    <span className="grid size-11 place-items-center rounded-lg bg-card text-muted-foreground ring-1 ring-border">
                        <GalleryVerticalEnd className="size-5" />
                    </span>
                    <h2 className="mt-4 text-base font-semibold">{filtered ? "没有匹配的公开作品" : "还没有公开作品"}</h2>
                    <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">{filtered ? "调整筛选条件后再查看。" : "审核通过并公开发布的作品会出现在这里。"}</p>
                    <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                        {filtered ? (
                            <Link href={basePath} className={primaryLinkClass}>
                                清除筛选
                            </Link>
                        ) : (
                            <>
                                <GalleryPublishLink className={primaryLinkClass} label="发布第一个作品" />
                                <Link href="/create" className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition hover:bg-muted">
                                    <Sparkles className="size-4" />
                                    开始创作
                                </Link>
                            </>
                        )}
                    </div>
                </section>
            )}

            {gallery.nextCursor ? (
                <div className="flex justify-center pt-2 sm:pt-4">
                    <Link href={nextPageHref(basePath, filters, gallery.nextCursor)} className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-4 text-sm font-medium text-foreground transition hover:bg-muted">
                        查看更多
                        <ArrowRight className="size-4" />
                    </Link>
                </div>
            ) : null}
            <PublicWorkPreviewModal slug={previewSlug || undefined} onClose={() => setPreviewSlug("")} onOpenCreator={setCreatorUsername} />
            <PublicCreatorModal username={creatorUsername || undefined} nextPath={basePath} onClose={() => setCreatorUsername("")} />
        </div>
    );
}

function MediaPlaceholder({ icon, label }: { icon: React.ReactNode; label: string }) {
    return (
        <div className="grid size-full place-items-center text-muted-foreground">
            <div className="flex flex-col items-center gap-2 text-xs">
                {icon}
                {label}
            </div>
        </div>
    );
}

function hasFilters(filters: GalleryFilters) {
    return Boolean(filters.keyword || filters.category || filters.tag || filters.featured || filters.sort !== "random");
}

function categoryClass(active: boolean) {
    return cn("inline-flex h-9 shrink-0 items-center rounded-md px-3 text-sm transition", active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground");
}

function galleryFilterHref(basePath: string, filters: GalleryFilters, category: string) {
    const params = new URLSearchParams();
    Object.entries({ ...filters, category, cursor: "" }).forEach(([key, value]) => {
        if (value) params.set(key, value);
    });
    const query = params.toString();
    return query ? `${basePath}?${query}` : basePath;
}

function nextPageHref(basePath: string, filters: GalleryFilters, cursor: string) {
    const params = new URLSearchParams();
    Object.entries({ ...filters, cursor }).forEach(([key, value]) => {
        if (value) params.set(key, value);
    });
    return `${basePath}?${params}`;
}
