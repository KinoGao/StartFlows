"use client";

import { useEffect, useRef, useState } from "react";
import { Image, Modal } from "antd";
import type { ImageProps } from "antd";
import { Maximize2, PlayCircle } from "lucide-react";

import { imagePreviewUrl } from "@/lib/media-image-url";
import { cn } from "@/lib/utils";

export const agentMediaPreviewPopupStyles = {
    popup: {
        root: { position: "fixed", inset: 0, width: "100vw", height: "100dvh", maxWidth: "none", maxHeight: "none", overflow: "hidden" },
        mask: { position: "fixed", inset: 0 },
        body: { position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" },
    },
} satisfies NonNullable<ImageProps["styles"]>;

export function getAgentMediaPreviewContainer() {
    return document.body;
}

export function AgentMediaPreview({
    type,
    url,
    title,
    className,
    fit = "cover",
    onDimensions,
}: {
    type: "text" | "image" | "video" | "audio";
    url: string;
    title: string;
    className?: string;
    fit?: "cover" | "contain" | "intrinsic";
    onDimensions?: (width: number, height: number) => void;
}) {
    const [videoOpen, setVideoOpen] = useState(false);
    const mediaRootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!onDimensions || (type !== "image" && type !== "video")) return;
        const media = mediaRootRef.current?.querySelector(type === "image" ? "img" : "video");
        if (!media) return;

        const reportDimensions = () => {
            const width = media instanceof HTMLImageElement ? media.naturalWidth : media.videoWidth;
            const height = media instanceof HTMLImageElement ? media.naturalHeight : media.videoHeight;
            if (width > 0 && height > 0) onDimensions(width, height);
        };
        const ready = media instanceof HTMLImageElement ? media.complete : media.readyState >= HTMLMediaElement.HAVE_METADATA;
        if (ready) reportDimensions();
        const eventName = media instanceof HTMLImageElement ? "load" : "loadedmetadata";
        media.addEventListener(eventName, reportDimensions);
        return () => media.removeEventListener(eventName, reportDimensions);
    }, [onDimensions, type, url]);

    if (type === "image") {
        const thumbnailUrl = imagePreviewUrl(url, 960);
        const largePreviewUrl = imagePreviewUrl(url, 1920);
        return (
            <div ref={mediaRootRef} className={cn("group/media relative overflow-hidden", className)}>
                <Image
                    src={thumbnailUrl}
                    alt={title}
                    onLoad={(event) => {
                        const image = event.currentTarget;
                        onDimensions?.(image.naturalWidth, image.naturalHeight);
                    }}
                    className={cn("!block", fit === "intrinsic" ? "!h-auto !w-auto max-h-[280px] max-w-full object-contain" : fit === "contain" ? "!size-full object-contain" : "!h-full !w-full object-cover")}
                    classNames={{
                        root: cn("cursor-zoom-in overflow-hidden", fit === "intrinsic" ? "!block max-w-full" : fit === "contain" ? "!block !size-full" : "!block !h-full !w-full"),
                        popup: { root: "agent-media-image-preview" },
                    }}
                    styles={agentMediaPreviewPopupStyles}
                    preview={{
                        src: largePreviewUrl,
                        getContainer: getAgentMediaPreviewContainer,
                        cover: (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-white">
                                <Maximize2 className="size-3.5" />
                                查看大图
                            </span>
                        ),
                    }}
                />
            </div>
        );
    }
    if (type === "video") {
        return (
            <>
                <div ref={mediaRootRef} className={cn("group/media relative overflow-hidden bg-black text-white", className)}>
                    <button type="button" className="block size-full" onClick={() => setVideoOpen(true)} aria-label={`打开视频：${title}`}>
                        <video
                            src={url}
                            muted
                            playsInline
                            preload="metadata"
                            onLoadedMetadata={(event) => onDimensions?.(event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
                            className={cn("size-full", fit === "contain" ? "object-contain" : "object-cover")}
                        />
                        <span className="absolute inset-0 grid place-items-center bg-black/10 transition group-hover/media:bg-black/20">
                            <span className="grid size-11 place-items-center rounded-full bg-black/55 shadow-sm backdrop-blur-sm">
                                <PlayCircle className="size-6" />
                            </span>
                        </span>
                        <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-md bg-black/55 opacity-80 backdrop-blur-sm">
                            <Maximize2 className="size-3.5" />
                        </span>
                    </button>
                </div>
                <Modal title={title} open={videoOpen} footer={null} centered destroyOnHidden width="min(960px, calc(100vw - 24px))" onCancel={() => setVideoOpen(false)} styles={{ body: { padding: 0, overflow: "hidden", background: "#000" } }}>
                    <video src={url} controls autoPlay playsInline preload="metadata" className="max-h-[78dvh] w-full bg-black object-contain" />
                </Modal>
            </>
        );
    }
    if (type === "audio") return <audio src={url} controls preload="metadata" className={cn("w-full", className)} />;
    return null;
}
