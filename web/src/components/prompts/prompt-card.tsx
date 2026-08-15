"use client";

import { Copy } from "lucide-react";
import type { ReactNode } from "react";
import { Button, Card, Tag } from "antd";

import { LazyMediaImage } from "@/components/media/lazy-media-image";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { formatPromptDate, type Prompt } from "@/services/api/prompts";

export function PromptCard({
    item,
    onOpen,
    onCopy,
    actionLabel = "复制",
    actionIcon = <Copy className="size-3.5" />,
    actionType = "text",
    extraAction,
}: {
    item: Prompt;
    onOpen: (previewUrl?: string) => void;
    onCopy: () => void;
    actionLabel?: string;
    actionIcon?: ReactNode;
    actionType?: "text" | "primary";
    extraAction?: ReactNode;
}) {
    return (
        <>
            <article className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground sm:hidden">
                <button type="button" className="grid w-full grid-cols-[5.5rem_minmax(0,1fr)] text-left" onClick={() => onOpen(item.coverUrl ? imagePreviewUrl(item.coverUrl, 480) : undefined)}>
                    {item.coverUrl ? (
                        <LazyMediaImage src={imagePreviewUrl(item.coverUrl, 480)} alt={item.title} containerClassName="h-24 w-full" imageClassName="h-24 w-full object-cover" />
                    ) : (
                        <div className="flex h-24 w-full items-center justify-center bg-stone-100 px-1.5 text-center text-xs font-medium text-stone-500 dark:bg-stone-900 dark:text-stone-400">{item.title}</div>
                    )}
                    <div className="min-w-0 p-2">
                        <div className="flex items-start justify-between gap-2">
                            <h2 className="line-clamp-1 text-sm font-semibold text-stone-950 dark:text-stone-100">{item.title}</h2>
                            <span className="shrink-0 text-[10px] text-stone-400 dark:text-stone-500">{formatPromptDate(item.updatedAt)}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-600 dark:text-stone-400">{item.prompt}</p>
                        <div className="mt-1.5 flex min-w-0 gap-1 overflow-hidden">
                            {item.tags.slice(0, 2).map((tag) => (
                                <Tag key={tag} className="m-0 max-w-24 truncate text-[10px]">
                                    {tag}
                                </Tag>
                            ))}
                        </div>
                    </div>
                </button>
                <div className="flex items-center gap-1.5 border-t border-border px-2 py-1">
                    <Button block={actionType === "primary"} type={actionType} size="small" icon={actionIcon} onClick={onCopy}>
                        {actionLabel}
                    </Button>
                    {extraAction}
                </div>
            </article>

            <Card
                hoverable
                className="hidden overflow-hidden sm:block"
                styles={{ body: { padding: 0 } }}
                cover={
                    <button type="button" className="block w-full text-left" onClick={() => onOpen(item.coverUrl ? imagePreviewUrl(item.coverUrl, 640) : undefined)}>
                        {item.coverUrl ? (
                            <LazyMediaImage src={imagePreviewUrl(item.coverUrl, 640)} alt={item.title} containerClassName="aspect-[16/10] w-full" imageClassName="h-full w-full object-cover" />
                        ) : (
                            <div className="flex aspect-[16/10] w-full items-center justify-center bg-stone-100 px-5 text-center text-sm font-medium text-stone-500 dark:bg-stone-900 dark:text-stone-400">{item.title}</div>
                        )}
                    </button>
                }
            >
                <button type="button" className="block w-full text-left" onClick={() => onOpen(item.coverUrl ? imagePreviewUrl(item.coverUrl, 640) : undefined)}>
                    <div className="p-3">
                        <div className="flex items-start justify-between gap-3">
                            <h2 className="line-clamp-1 text-sm font-semibold text-stone-950 dark:text-stone-100">{item.title}</h2>
                            <span className="shrink-0 text-xs text-stone-400 dark:text-stone-500">{formatPromptDate(item.updatedAt)}</span>
                        </div>
                        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-stone-600 dark:text-stone-400">{item.prompt}</p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {item.tags.map((tag) => (
                                <Tag key={tag} className="m-0 text-[11px]">
                                    {tag}
                                </Tag>
                            ))}
                        </div>
                    </div>
                </button>
                <div className="flex items-center gap-1.5 px-3 pb-3">
                    <Button block={actionType === "primary"} type={actionType} size="small" icon={actionIcon} onClick={onCopy}>
                        {actionLabel}
                    </Button>
                    {extraAction}
                </div>
            </Card>
        </>
    );
}
