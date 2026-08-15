"use client";

import type { CSSProperties } from "react";
import { Copy, Download, Pencil } from "lucide-react";

import { downloadAgentMedia, type AgentMediaDownload } from "@/components/agent/agent-media-download";
import { useCopyText } from "@/hooks/use-copy-text";
import { cn } from "@/lib/utils";

export function AgentMessageActions({
    text,
    downloads = [],
    onEdit,
    align = "start",
    className,
    style,
}: {
    text: string;
    downloads?: AgentMediaDownload[];
    onEdit?: (text: string) => void;
    align?: "start" | "end";
    className?: string;
    style?: CSSProperties;
}) {
    const copyText = useCopyText();
    if (!text.trim() && !downloads.length) return null;
    const downloadLabel = downloads.length > 1 ? `下载本条消息的全部媒体，共 ${downloads.length} 个` : downloads[0]?.type === "video" ? "下载视频" : "下载图片";
    return (
        <div
            className={cn(
                "mt-1 flex min-h-7 items-center gap-0.5 text-stone-500 opacity-70 transition sm:opacity-0 sm:group-hover/message:opacity-70 sm:group-focus-within/message:opacity-70 dark:text-stone-400",
                align === "end" ? "justify-end" : "justify-start",
                className,
            )}
            style={style}
        >
            {downloads.length ? (
                <button
                    type="button"
                    className="grid size-8 place-items-center rounded-md text-current transition hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 sm:size-7"
                    onClick={() => downloadAgentMedia(downloads)}
                    aria-label={downloadLabel}
                    title={downloads.length > 1 ? "下载全部媒体" : downloadLabel}
                >
                    <Download className="size-3.5" />
                </button>
            ) : null}
            {text.trim() ? (
                <button
                    type="button"
                    className="grid size-8 place-items-center rounded-md text-current transition hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 sm:size-7"
                    onClick={() => copyText(text, "消息已复制")}
                    aria-label="复制消息"
                    title="复制"
                >
                    <Copy className="size-3.5" />
                </button>
            ) : null}
            {onEdit ? (
                <button
                    type="button"
                    className="grid size-8 place-items-center rounded-md text-current transition hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 sm:size-7"
                    onClick={() => onEdit(text)}
                    aria-label="编辑消息"
                    title="编辑并重新发送"
                >
                    <Pencil className="size-3.5" />
                </button>
            ) : null}
        </div>
    );
}
