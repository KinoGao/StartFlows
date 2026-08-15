"use client";

import { Modal } from "antd";
import { Film, ImageIcon, ScanSearch } from "lucide-react";

import { imagePreviewUrl } from "@/lib/media-image-url";

export type DramaPreviewMedia = { type: "image" | "video"; url: string; title: string };

export function DramaMediaThumbnail({ media, onOpen }: { media: DramaPreviewMedia; onOpen: (media: DramaPreviewMedia) => void }) {
    return (
        <button
            type="button"
            className="group relative aspect-video w-44 shrink-0 overflow-hidden rounded-md border border-border bg-muted text-left"
            onClick={() => onOpen(media)}
            aria-label={`查看${media.type === "image" ? "图片" : "视频"}：${media.title}`}
        >
            {media.type === "image" ? (
                <img className="size-full object-cover transition group-hover:scale-[1.02]" src={imagePreviewUrl(media.url, 640)} alt={media.title} />
            ) : (
                <video className="pointer-events-none size-full object-cover" src={media.url} muted playsInline preload="metadata" />
            )}
            <span className="absolute inset-0 grid place-items-center bg-black/0 text-white opacity-0 transition group-hover:bg-black/25 group-hover:opacity-100 group-focus-visible:bg-black/25 group-focus-visible:opacity-100">
                <ScanSearch className="size-5 drop-shadow" />
            </span>
            <span className="absolute bottom-1.5 left-1.5 grid size-6 place-items-center rounded bg-black/60 text-white">{media.type === "image" ? <ImageIcon className="size-3.5" /> : <Film className="size-3.5" />}</span>
        </button>
    );
}

export function DramaMediaPreviewModal({ media, onClose }: { media?: DramaPreviewMedia; onClose: () => void }) {
    return (
        <Modal title={media?.title || "媒体预览"} open={Boolean(media)} width={960} footer={null} destroyOnHidden onCancel={onClose}>
            {media?.type === "image" ? <img className="max-h-[75dvh] w-full rounded-md object-contain" src={imagePreviewUrl(media.url, 2048)} alt={media.title} /> : null}
            {media?.type === "video" ? <video className="max-h-[75dvh] w-full rounded-md bg-black" src={media.url} controls autoPlay playsInline preload="metadata" /> : null}
        </Modal>
    );
}
