"use client";

import { AudioLines, Copy, Download, FileText, Film, ImageIcon, PencilLine, Share2, Trash2 } from "lucide-react";
import { Button, Image, Modal, Space, Tag, Tooltip, Typography } from "antd";
import { formatBytes } from "@/lib/image-utils";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { cn } from "@/lib/utils";
import type { Asset } from "@/stores/use-asset-store";

export function AssetCard({
    asset,
    onOpen,
    onEdit,
    onCopy,
    onDownload,
    onDelete,
    onPublish,
}: {
    asset: Asset;
    onOpen: () => void;
    onEdit: () => void;
    onCopy: (asset: Asset) => void;
    onDownload: (asset: Asset) => void;
    onDelete: () => void;
    onPublish?: () => void;
}) {
    const cover = asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "");
    const summary = assetSummary(asset);
    const action = (label: string) => `${label} ${asset.title}`;
    return (
        <article className="group min-w-0 overflow-hidden rounded-xl border border-border bg-card transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-foreground/30">
            <button type="button" aria-label={`查看 ${asset.title}`} className="relative block w-full overflow-hidden bg-muted text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" onClick={onOpen}>
                {cover ? (
                    <img src={imagePreviewUrl(cover, 800)} alt={asset.title} className="aspect-[16/10] w-full object-cover transition-transform duration-300 group-hover:scale-[1.025]" />
                ) : (
                    <span className="flex aspect-[16/10] flex-col items-center justify-center gap-2 p-4 text-center text-xs leading-5 text-muted-foreground sm:p-6">
                        <span className="grid size-9 place-items-center rounded-full border border-border bg-background/80 text-foreground">{assetKindIcon(asset.kind)}</span>
                        <span className="line-clamp-3">{asset.kind === "text" ? asset.data.content : "暂无封面"}</span>
                    </span>
                )}
                <span className="absolute bottom-2.5 left-2.5 inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/65 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                    {assetKindIcon(asset.kind)} {assetKindLabel(asset.kind)}
                </span>
            </button>
            <div className="min-w-0 p-3 sm:p-3.5">
                <button type="button" className="block max-w-full text-left outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring" onClick={onOpen}>
                    <h2 className="truncate text-[15px] font-semibold text-foreground">{asset.title}</h2>
                </button>
                <p className="mt-1 truncate text-[11px] text-muted-foreground">{asset.source || assetKindLabel(asset.kind)}</p>
                <p className="mt-2 truncate text-xs text-muted-foreground">{summary}</p>
                <div className="mt-3 flex min-w-0 items-center justify-between gap-2 border-t border-border pt-2.5">
                    <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
                        {(asset.tags || []).slice(0, 2).map((tag) => (
                            <span key={tag} className="max-w-24 truncate rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                                {tag}
                            </span>
                        ))}
                        {asset.tags.length > 2 ? <span className="shrink-0 text-[10px] text-muted-foreground">+{asset.tags.length - 2}</span> : null}
                        {!asset.tags.length ? <span className="truncate text-[10px] text-muted-foreground">{asset.note || "未添加标签"}</span> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                        {asset.kind !== "video" ? (
                            <Tooltip title="编辑">
                                <Button type="text" size="small" shape="circle" icon={<PencilLine className="size-3.5" />} aria-label={action("编辑")} onClick={onEdit} />
                            </Tooltip>
                        ) : null}
                        {asset.kind === "text" ? (
                            <Tooltip title="复制">
                                <Button type="text" size="small" shape="circle" icon={<Copy className="size-3.5" />} aria-label={action("复制")} onClick={() => void onCopy(asset)} />
                            </Tooltip>
                        ) : (
                            <Tooltip title="下载">
                                <Button type="text" size="small" shape="circle" icon={<Download className="size-3.5" />} aria-label={action("下载")} onClick={() => onDownload(asset)} />
                            </Tooltip>
                        )}
                        {onPublish ? (
                            <Tooltip title="发布作品">
                                <Button type="text" size="small" shape="circle" icon={<Share2 className="size-3.5" />} onClick={onPublish} aria-label={action("发布")} />
                            </Tooltip>
                        ) : null}
                        <Tooltip title="删除">
                            <Button danger type="text" size="small" shape="circle" icon={<Trash2 className="size-3.5" />} aria-label={action("删除")} onClick={onDelete} />
                        </Tooltip>
                    </div>
                </div>
            </div>
        </article>
    );
}

export function AssetPreviewModal({ asset, onClose, onCopy, onDownload }: { asset: Asset | null; onClose: () => void; onCopy: (asset: Asset) => void; onDownload: (asset: Asset) => void }) {
    const cover = asset ? asset.coverUrl || (asset.kind === "image" ? asset.data.dataUrl : "") : "";
    return (
        <Modal title="素材详情" open={Boolean(asset)} width={760} centered footer={null} onCancel={onClose} destroyOnHidden>
            {asset ? (
                <div className="max-h-[72vh] space-y-4 overflow-y-auto pr-1">
                    {cover ? (
                        <Image src={imagePreviewUrl(cover, 960)} alt={asset.title} className="rounded-lg" preview={{ src: imagePreviewUrl(cover, 1920) }} />
                    ) : (
                        <div className="rounded-lg border border-stone-200 bg-stone-50 p-5 text-sm leading-6 text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-300">{asset.kind === "text" ? asset.data.content : "暂无封面"}</div>
                    )}
                    <div>
                        <Typography.Title level={4} className="!mb-2">
                            {asset.title}
                        </Typography.Title>
                        <Space size={[4, 4]} wrap>
                            <Tag>{assetKindLabel(asset.kind)}</Tag>
                            {(asset.tags || []).map((tag) => (
                                <Tag key={tag}>{tag}</Tag>
                            ))}
                        </Space>
                    </div>
                    <div className="rounded-lg border border-stone-200 p-4 dark:border-stone-800">
                        <Typography.Text type="secondary" className="block text-xs">
                            内容
                        </Typography.Text>
                        {asset.kind === "text" ? (
                            <Typography.Paragraph className="mt-2 whitespace-pre-wrap">{asset.data.content}</Typography.Paragraph>
                        ) : asset.kind === "video" ? (
                            <video src={asset.data.url} controls className="mt-2 aspect-video w-full rounded-lg bg-black" />
                        ) : asset.kind === "audio" ? (
                            <audio src={asset.data.url} controls className="mt-3 w-full" />
                        ) : (
                            <Typography.Text className="mt-2 block">
                                {asset.data.width}x{asset.data.height} · {formatBytes(asset.data.bytes)} · {asset.data.mimeType}
                            </Typography.Text>
                        )}
                    </div>
                    {asset.note ? (
                        <div>
                            <Typography.Text type="secondary">备注</Typography.Text>
                            <Typography.Paragraph className="mt-1">{asset.note}</Typography.Paragraph>
                        </div>
                    ) : null}
                    <Space onClick={(event) => event.stopPropagation()}>
                        {asset.kind === "text" ? (
                            <Tooltip title="复制文本">
                                <Button type="primary" shape="circle" icon={<Copy className="size-4" />} aria-label={`复制 ${asset.title}`} onClick={() => onCopy(asset)} />
                            </Tooltip>
                        ) : null}
                        {asset.kind !== "text" ? (
                            <Tooltip title={asset.kind === "video" ? "下载视频" : asset.kind === "audio" ? "下载音频" : "下载图片"}>
                                <Button type="primary" shape="circle" icon={<Download className="size-4" />} aria-label={`下载 ${asset.title}`} onClick={() => onDownload(asset)} />
                            </Tooltip>
                        ) : null}
                    </Space>
                </div>
            ) : null}
        </Modal>
    );
}

export function assetSummary(asset: Asset) {
    if (asset.kind === "text") return asset.data.content;
    if (asset.kind === "audio") return `${formatDuration(asset.data.durationMs)} · ${formatBytes(asset.data.bytes)} · ${asset.data.mimeType}`;
    return `${asset.data.width}x${asset.data.height} · ${formatBytes(asset.data.bytes)} · ${asset.data.mimeType}`;
}

export function assetSearchText(asset: Asset) {
    return [asset.title, asset.source || "", asset.note || "", (asset.tags || []).join(" "), asset.kind === "text" ? asset.data.content : asset.data.mimeType].join(" ").toLowerCase();
}

function assetKindLabel(kind: Asset["kind"]) {
    return kind === "image" ? "图片" : kind === "video" ? "视频" : kind === "audio" ? "音频" : "文本";
}

function assetKindIcon(kind: Asset["kind"]) {
    const className = "size-3.5";
    if (kind === "image") return <ImageIcon className={className} />;
    if (kind === "video") return <Film className={className} />;
    if (kind === "audio") return <AudioLines className={className} />;
    return <FileText className={className} />;
}

function formatDuration(durationMs?: number) {
    if (!durationMs) return "未知时长";
    const seconds = Math.max(1, Math.round(durationMs / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
