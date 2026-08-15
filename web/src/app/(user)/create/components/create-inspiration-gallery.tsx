"use client";

import type { MenuProps } from "antd";
import { App, Dropdown } from "antd";
import { Copy, Ellipsis, Eye, FileText, ImagePlus, LoaderCircle, RefreshCw, Video } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { PublicWorkPreviewModal } from "@/components/works/public-work-preview-modal";
import { PublicCreatorModal } from "@/components/works/public-creator-modal";
import { PublicWorkLikeButton } from "@/components/works/public-work-like-button";
import { ResponsiveMasonryGrid } from "@/components/works/responsive-masonry-grid";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { LazyMediaImage } from "@/components/media/lazy-media-image";
import { PublicWorkCardTitle } from "@/components/works/public-work-card-title";
import { userAvatarFallback } from "@/lib/user-avatar";
import { WORK_CATEGORY_OPTIONS } from "@/lib/work-publication-options";
import { cn } from "@/lib/utils";
import { listPublicGallery, type PublicGalleryItem } from "@/services/api/work-governance";

const categories = [{ value: "", label: "全部" }, ...WORK_CATEGORY_OPTIONS];

export function CreateInspirationGallery({ onUsePrompt, onUseImage }: { onUsePrompt: (prompt: string) => void; onUseImage: (item: PublicGalleryItem) => Promise<void> }) {
    const [category, setCategory] = useState("");
    const [items, setItems] = useState<PublicGalleryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reloadToken, setReloadToken] = useState(0);
    const [importingSlug, setImportingSlug] = useState("");
    const [previewSlug, setPreviewSlug] = useState("");
    const [creatorUsername, setCreatorUsername] = useState("");

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError("");
        void listPublicGallery({ category, limit: 12, sort: "random" })
            .then((result) => {
                if (active) setItems(result.items);
            })
            .catch((error) => {
                if (active) setError(error instanceof Error ? error.message : "灵感作品加载失败");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [category, reloadToken]);

    const importImage = async (item: PublicGalleryItem) => {
        setImportingSlug(item.slug);
        try {
            await onUseImage(item);
        } finally {
            setImportingSlug("");
        }
    };

    const previewItem = items.find((item) => item.slug === previewSlug);

    return (
        <section className="mt-7 w-full sm:mt-12" aria-labelledby="create-inspiration-heading">
            <div className="flex min-w-0 items-center justify-between gap-3">
                <h2 id="create-inspiration-heading" className="text-[15px] font-semibold text-[#20242a] dark:text-[#f3f5f7]">
                    灵感发现
                </h2>
                <Link href="/community" className="text-xs text-[#697381] transition hover:text-[#20242a] dark:text-[#9aa3af] dark:hover:text-white">
                    查看全部 →
                </Link>
            </div>

            <nav className="hide-scrollbar mt-3 flex min-w-0 gap-1 overflow-x-auto border-b border-[#e8ebef] pb-2 dark:border-[#292d33]" aria-label="灵感分类">
                {categories.map((item) => (
                    <button
                        key={item.value || "all"}
                        type="button"
                        className={cn(
                            "h-9 shrink-0 rounded-md px-3 text-sm transition",
                            category === item.value ? "bg-[#eef1f4] font-medium text-[#20242a] dark:bg-[#292f37] dark:text-white" : "text-[#697381] hover:bg-[#f2f4f6] hover:text-[#20242a] dark:text-[#9aa3af] dark:hover:bg-[#242930] dark:hover:text-white",
                        )}
                        aria-pressed={category === item.value}
                        onClick={() => setCategory(item.value)}
                    >
                        {item.label}
                    </button>
                ))}
            </nav>

            {loading ? (
                <div className="flex min-h-36 items-center justify-center gap-2 text-xs text-[#9aa2ad] dark:text-[#737d89]">
                    <LoaderCircle className="size-4 animate-spin" /> 正在读取灵感作品...
                </div>
            ) : error ? (
                <div className="flex min-h-36 flex-col items-center justify-center gap-2 text-center">
                    <p className="text-xs text-[#9a5b5b] dark:text-[#d49a9a]">{error}</p>
                    <button type="button" className="inline-flex items-center gap-1.5 text-xs font-medium text-[#697381] hover:text-[#20242a] dark:text-[#9aa3af] dark:hover:text-white" onClick={() => setReloadToken((value) => value + 1)}>
                        <RefreshCw className="size-3.5" /> 重新读取
                    </button>
                </div>
            ) : items.length ? (
                <ResponsiveMasonryGrid className="grid-cols-2 pt-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6" ariaLabel="灵感作品列表">
                    {items.map((item) => (
                        <InspirationCard key={item.slug} item={item} importing={importingSlug === item.slug} onOpen={() => setPreviewSlug(item.slug)} onOpenAuthor={setCreatorUsername} onUsePrompt={onUsePrompt} onUseImage={() => void importImage(item)} />
                    ))}
                </ResponsiveMasonryGrid>
            ) : (
                <div className="flex min-h-32 items-center justify-center border-b border-dashed border-[#e2e7eb] text-sm text-[#9aa2ad] dark:border-[#2b3037] dark:text-[#737d89]">当前分类还没有公开作品</div>
            )}
            <PublicWorkPreviewModal
                slug={previewSlug || undefined}
                imageImporting={importingSlug === previewSlug}
                onClose={() => setPreviewSlug("")}
                onOpenCreator={setCreatorUsername}
                onUsePrompt={(prompt) => {
                    onUsePrompt(prompt);
                    setPreviewSlug("");
                }}
                onUseImage={
                    previewItem?.preview?.mediaType === "image"
                        ? async () => {
                              await importImage(previewItem);
                              setPreviewSlug("");
                          }
                        : undefined
                }
            />
            <PublicCreatorModal username={creatorUsername || undefined} nextPath="/create" onClose={() => setCreatorUsername("")} />
        </section>
    );
}

function InspirationCard({
    item,
    importing,
    onOpen,
    onOpenAuthor,
    onUsePrompt,
    onUseImage,
}: {
    item: PublicGalleryItem;
    importing: boolean;
    onOpen: () => void;
    onOpenAuthor: (username: string) => void;
    onUsePrompt: (prompt: string) => void;
    onUseImage: () => void;
}) {
    const { message } = App.useApp();
    const image = item.preview?.mediaType === "image";
    const authorUsername = item.authorUsername;
    const menuItems: MenuProps["items"] = [
        item.publicPrompt ? { key: "prompt", icon: <FileText className="size-4" />, label: "使用提示词" } : null,
        item.publicPrompt ? { key: "copy", icon: <Copy className="size-4" />, label: "复制提示词" } : null,
        image ? { key: "image", icon: <ImagePlus className="size-4" />, label: "使用图片" } : null,
    ].filter(Boolean) as MenuProps["items"];

    const runAction: MenuProps["onClick"] = ({ key }) => {
        if (key === "prompt") return onUsePrompt(item.publicPrompt);
        if (key === "image") return onUseImage();
        if (key === "copy") {
            void navigator.clipboard
                .writeText(item.publicPrompt)
                .then(() => message.success("提示词已复制"))
                .catch(() => message.error("复制失败，请打开作品详情后手动复制"));
        }
    };

    return (
        <article className="group w-full min-w-0 overflow-hidden text-[#20242a] dark:text-[#f3f5f7]">
            <div className="relative overflow-hidden rounded-lg bg-[#eef1f4] dark:bg-[#252a31]">
                <button type="button" className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6e87db]" onClick={onOpen} aria-label={`查看作品：${item.title}`} aria-haspopup="dialog">
                    {image ? (
                        <LazyMediaImage src={imagePreviewUrl(item.preview!.url, 640)} alt={item.title} containerClassName="w-full" imageClassName="block h-auto w-full group-hover:scale-[1.015]" />
                    ) : item.preview?.mediaType === "video" ? (
                        <video src={item.preview.url} muted playsInline preload="metadata" className="aspect-video w-full object-cover" />
                    ) : (
                        <span className="grid aspect-[4/3] w-full place-items-center text-[#8b949f] dark:text-[#737d89]">
                            <ImagePlus className="size-7" />
                        </span>
                    )}
                </button>
                {item.preview?.mediaType === "video" ? (
                    <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-md bg-black/65 text-white" title="视频作品">
                        <Video className="size-3.5" />
                    </span>
                ) : null}
                <PublicWorkCardTitle title={item.title} />
            </div>
            <div className="min-w-0 px-0.5 pb-1 pt-2">
                <div className="flex min-w-0 items-center justify-between gap-2 text-[11px] text-[#8b949f] dark:text-[#7f8996]">
                    {authorUsername ? (
                        <button
                            type="button"
                            className="flex min-w-0 items-center gap-1.5 rounded-sm text-left transition hover:text-[#20242a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6e87db] dark:hover:text-white"
                            aria-label={`查看 ${item.authorName || authorUsername} 的主页`}
                            aria-haspopup="dialog"
                            onClick={() => onOpenAuthor(authorUsername)}
                        >
                            <span className="grid size-5 shrink-0 place-items-center overflow-hidden rounded-full bg-[#20242a] text-[8px] font-semibold text-white dark:bg-[#f3f5f7] dark:text-[#20242a]">
                                {item.authorAvatarUrl ? <img src={item.authorAvatarUrl} alt="" className="size-full object-cover" loading="lazy" /> : userAvatarFallback(item.authorName || "匿名作者")}
                            </span>
                            <span className="truncate">{item.authorName || "匿名作者"}</span>
                        </button>
                    ) : (
                        <span className="flex min-w-0 items-center gap-1.5">
                            <span className="grid size-5 shrink-0 place-items-center overflow-hidden rounded-full bg-[#20242a] text-[8px] font-semibold text-white dark:bg-[#f3f5f7] dark:text-[#20242a]">
                                {item.authorAvatarUrl ? <img src={item.authorAvatarUrl} alt="" className="size-full object-cover" loading="lazy" /> : userAvatarFallback(item.authorName || "匿名作者")}
                            </span>
                            <span className="truncate">{item.authorName || "匿名作者"}</span>
                        </span>
                    )}
                    <span className="flex shrink-0 items-center gap-2 tabular-nums">
                        <span className="inline-flex items-center gap-1" title="访问">
                            <Eye className="size-3" />
                            {item.viewCount}
                        </span>
                        <PublicWorkLikeButton slug={item.slug} initialCount={item.likeCount} compact nextPath="/create" />
                        {menuItems?.length ? (
                            <Dropdown menu={{ items: menuItems, onClick: runAction }} trigger={["click"]} placement="bottomRight">
                                <button
                                    type="button"
                                    disabled={importing}
                                    className="grid size-7 place-items-center rounded-md text-[#7f8996] transition hover:bg-[#eef1f4] hover:text-[#20242a] disabled:cursor-wait disabled:opacity-60 dark:hover:bg-[#252a31] dark:hover:text-white"
                                    aria-label={`使用作品：${item.title}`}
                                    aria-haspopup="menu"
                                >
                                    {importing ? <LoaderCircle className="size-3.5 animate-spin" /> : <Ellipsis className="size-4" />}
                                </button>
                            </Dropdown>
                        ) : null}
                    </span>
                </div>
            </div>
        </article>
    );
}
