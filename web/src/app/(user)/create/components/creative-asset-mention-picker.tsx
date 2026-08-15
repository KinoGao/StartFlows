"use client";

import { ChevronDown, ChevronUp, FileAudio, FileText, FileVideo, ImageIcon, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import type { CreativeAsset } from "@/lib/creative-runtime-contract";
import { imagePreviewUrl } from "@/lib/media-image-url";

export function CreativeAssetMentionPicker({ assets, selectedAssetIds, onSelect }: { assets: CreativeAsset[]; selectedAssetIds: string[]; onSelect: (asset: CreativeAsset) => void }) {
    const [activeType, setActiveType] = useState<"image" | "video">("image");
    const gridRef = useRef<HTMLDivElement>(null);
    const [scrollEdges, setScrollEdges] = useState({ previous: false, next: false });
    const { imageAssets, videoAssets } = useMemo(() => {
        const next = { imageAssets: [] as CreativeAsset[], videoAssets: [] as CreativeAsset[] };
        for (const asset of assets) {
            if (asset.type === "image") next.imageAssets.push(asset);
            if (asset.type === "video") next.videoAssets.push(asset);
        }
        return next;
    }, [assets]);
    const visibleType = activeType === "image" && imageAssets.length ? "image" : activeType === "video" && videoAssets.length ? "video" : imageAssets.length ? "image" : videoAssets.length ? "video" : undefined;
    const visibleAssets = visibleType === "video" ? videoAssets : imageAssets;
    const showTypeSwitcher = imageAssets.length > 0 && videoAssets.length > 0;
    const selected = useMemo(() => new Set(selectedAssetIds), [selectedAssetIds]);

    useEffect(() => {
        const grid = gridRef.current;
        if (!grid || !visibleType) return;
        const update = () => {
            const maximum = Math.max(0, grid.scrollHeight - grid.clientHeight);
            const previous = grid.scrollTop > 1;
            const next = grid.scrollTop < maximum - 1;
            setScrollEdges((current) => (current.previous === previous && current.next === next ? current : { previous, next }));
        };
        const frame = window.requestAnimationFrame(update);
        const resizeObserver = new ResizeObserver(update);
        resizeObserver.observe(grid);
        grid.addEventListener("scroll", update, { passive: true });
        return () => {
            window.cancelAnimationFrame(frame);
            resizeObserver.disconnect();
            grid.removeEventListener("scroll", update);
        };
    }, [visibleAssets.length, visibleType]);

    if (!visibleType) return <p className="w-64 px-3 py-5 text-center text-xs text-[#8b949f] dark:text-[#7f8996]">没有匹配的图片或视频</p>;
    return (
        <div className="flex w-[min(17rem,calc(100vw-2rem))] min-w-0 flex-col overflow-hidden p-1.5" data-testid="creative-asset-mention-picker">
            {showTypeSwitcher ? (
                <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-black/[0.035] p-1 dark:bg-white/[0.06]" role="tablist" aria-label="引用素材类型">
                    <TypeTab type="image" count={imageAssets.length} active={visibleType === "image"} onClick={() => setActiveType("image")} />
                    <TypeTab type="video" count={videoAssets.length} active={visibleType === "video"} onClick={() => setActiveType("video")} />
                </div>
            ) : null}
            <div className="relative min-h-0 overflow-hidden">
                <div ref={gridRef} className="hide-scrollbar grid max-h-[min(16rem,calc(100dvh-10rem))] grid-cols-4 gap-1.5 overflow-y-auto overscroll-contain p-0.5" data-testid={`creative-asset-mention-${visibleType}-grid`}>
                    {visibleAssets.map((asset) => (
                        <button
                            key={asset.id}
                            type="button"
                            data-asset-id={asset.id}
                            className={`group relative aspect-square min-w-0 overflow-hidden rounded-md border-2 bg-[#eef1f3] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6268d8] dark:bg-[#292f37] ${
                                selected.has(asset.id) ? "border-[#6268d8] dark:border-[#a8abff]" : "border-transparent hover:border-[#c8ccef] dark:hover:border-[#60658f]"
                            }`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => onSelect(asset)}
                            aria-label={`选择${asset.title}`}
                            title={asset.title}
                        >
                            <AssetPreview asset={asset} />
                        </button>
                    ))}
                </div>
                {scrollEdges.previous ? (
                    <span
                        className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-6 items-start justify-center bg-gradient-to-b from-white via-white/85 to-transparent pt-0.5 text-[#8b949f] dark:from-[#1f2328] dark:via-[#1f2328]/85 dark:text-[#929ca8]"
                        aria-hidden="true"
                    >
                        <ChevronUp className="size-3.5" />
                    </span>
                ) : null}
                {scrollEdges.next ? (
                    <span
                        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex h-6 items-end justify-center bg-gradient-to-t from-white via-white/85 to-transparent pb-0.5 text-[#8b949f] dark:from-[#1f2328] dark:via-[#1f2328]/85 dark:text-[#929ca8]"
                        aria-hidden="true"
                    >
                        <ChevronDown className="size-3.5" />
                    </span>
                ) : null}
            </div>
        </div>
    );
}

function TypeTab({ type, count, active, onClick }: { type: "image" | "video"; count: number; active: boolean; onClick: () => void }) {
    const label = type === "image" ? "图片" : "视频";
    const Icon = type === "image" ? ImageIcon : FileVideo;
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            className={`flex h-7 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                active ? "bg-white text-primary shadow-[0_1px_3px_rgba(32,36,42,0.09)] dark:bg-white/10" : "text-[#68727e] hover:bg-white/70 hover:text-[#303844] dark:text-[#aab3bd] dark:hover:bg-white/[0.07] dark:hover:text-white"
            }`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onClick}
        >
            <Icon className="size-3.5 shrink-0" aria-hidden="true" />
            <span>{label}</span>
            <span className="text-[10px] font-normal tabular-nums opacity-55">{count}</span>
        </button>
    );
}

function AssetPreview({ asset }: { asset: CreativeAsset }) {
    const url = asset.serverUrl || asset.remoteUrl;
    if (asset.type === "image" && url) return <img src={imagePreviewUrl(url, 240)} alt="" className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />;
    const coverUrl = asset.type === "video" && typeof asset.metadata.coverUrl === "string" ? asset.metadata.coverUrl : "";
    if (asset.type === "video") return <VideoAssetPreview url={url} coverUrl={coverUrl} />;
    const Icon = asset.type === "audio" ? FileAudio : asset.type === "text" ? FileText : ImageIcon;
    return (
        <span className="grid size-full place-items-center text-[#66717e] dark:text-[#aab3bf]">
            <Icon className="size-5" />
        </span>
    );
}

function VideoAssetPreview({ url, coverUrl }: { url?: string; coverUrl: string }) {
    const [coverFailed, setCoverFailed] = useState(false);
    const [videoFailed, setVideoFailed] = useState(false);
    const showCover = Boolean(coverUrl) && !coverFailed;
    const showVideo = !showCover && Boolean(url) && !videoFailed;
    return (
        <>
            {showCover ? <img src={imagePreviewUrl(coverUrl, 240)} alt="" className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" onError={() => setCoverFailed(true)} /> : null}
            {showVideo ? <video src={url} muted playsInline preload="metadata" aria-hidden="true" className="size-full bg-black object-cover transition-transform duration-200 group-hover:scale-[1.03]" onError={() => setVideoFailed(true)} /> : null}
            {!showCover && !showVideo ? (
                <span className="grid size-full place-items-center text-[#66717e] dark:text-[#aab3bf]">
                    <FileVideo className="size-5" />
                </span>
            ) : null}
            {showCover || showVideo ? (
                <span className="pointer-events-none absolute bottom-1 left-1 grid size-5 place-items-center rounded-full bg-black/55 text-white">
                    <Play className="ml-0.5 size-2.5 fill-current" />
                </span>
            ) : null}
        </>
    );
}
