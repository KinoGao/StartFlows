"use client";

import { Film, Image as ImageIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { LazyMediaImage } from "@/components/media/lazy-media-image";
import type { PublicWorkPublication } from "@/services/api/work-publications";

type PublicWorkAsset = PublicWorkPublication["assets"][number];

export function PublicWorkMediaBrowser({ assets, title, compact = false }: { assets: PublicWorkAsset[]; title: string; compact?: boolean }) {
    const ordered = useMemo(() => assets.filter((asset) => asset.mediaType === "image" || asset.mediaType === "video"), [assets]);
    const [activeId, setActiveId] = useState(ordered[0]?.id || "");
    const active = ordered.find((asset) => asset.id === activeId) || ordered[0];

    useEffect(() => setActiveId(ordered[0]?.id || ""), [ordered]);

    if (!active) return <div className="grid min-h-56 place-items-center border-y border-dashed border-border text-sm text-muted-foreground">作品没有可展示的媒体</div>;

    return (
        <section className={cn("grid min-w-0 gap-3", compact ? "md:grid-cols-[64px_minmax(0,1fr)]" : "lg:grid-cols-[72px_minmax(0,1fr)]")} aria-label="作品媒体">
            <div
                className={cn(
                    "order-2 flex min-w-0 gap-2 overflow-x-auto pb-1",
                    compact ? "md:order-1 md:max-h-[min(68dvh,680px)] md:flex-col md:overflow-x-hidden md:overflow-y-auto md:pr-1" : "lg:order-1 lg:max-h-[min(74dvh,800px)] lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:pr-1",
                )}
            >
                {ordered.map((asset, index) => (
                    <button
                        key={asset.id}
                        type="button"
                        onClick={() => setActiveId(asset.id)}
                        className={cn(
                            "relative size-16 shrink-0 overflow-hidden rounded-md border bg-muted transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            asset.id === active.id ? "border-foreground ring-1 ring-foreground" : "border-border hover:border-foreground/40",
                        )}
                        aria-label={`查看${mediaLabel(asset.mediaType)} ${index + 1}`}
                        aria-pressed={asset.id === active.id}
                    >
                        {asset.mediaType === "image" ? (
                            <LazyMediaImage src={imagePreviewUrl(asset.url, 256)} alt="" containerClassName="size-full min-h-0" imageClassName="size-full object-cover" />
                        ) : asset.mediaType === "video" ? (
                            <video src={asset.url} muted playsInline preload="metadata" className="size-full object-cover" aria-hidden="true" />
                        ) : null}
                        <span className="absolute bottom-1 right-1 grid size-4 place-items-center rounded bg-black/65 text-white" aria-hidden="true">
                            {asset.mediaType === "image" ? <ImageIcon className="size-2.5" /> : <Film className="size-2.5" />}
                        </span>
                    </button>
                ))}
            </div>

            <div
                className={cn(
                    "order-1 flex min-h-56 min-w-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/45",
                    compact ? "h-[min(52dvh,540px)] md:order-2 md:h-[min(68dvh,680px)]" : "h-[min(58dvh,560px)] lg:order-2 lg:h-[min(76dvh,860px)]",
                )}
            >
                {active.mediaType === "image" ? (
                    <LazyMediaImage src={imagePreviewUrl(active.url, 1920)} alt={title} containerClassName="flex size-full min-h-0 items-center justify-center bg-transparent" imageClassName="max-h-full max-w-full object-contain" />
                ) : active.mediaType === "video" ? (
                    <video key={active.id} src={active.url} controls playsInline preload="metadata" className="max-h-full max-w-full object-contain" aria-label={title} />
                ) : null}
            </div>
        </section>
    );
}

function mediaLabel(type: PublicWorkAsset["mediaType"]) {
    return type === "image" ? "图片" : "视频";
}
