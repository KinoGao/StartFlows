"use client";

import { Copy, FolderPlus } from "lucide-react";
import { Button, Modal, Space, Tag } from "antd";

import { LazyMediaImage } from "@/components/media/lazy-media-image";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { formatPromptDate, type Prompt } from "@/services/api/prompts";

export function PromptDetailDialog({ prompt, previewUrl, onClose, onCopy, onSaveAsset }: { prompt: Prompt | null; previewUrl?: string; onClose: () => void; onCopy: (prompt: string) => void; onSaveAsset?: (prompt: Prompt) => void }) {
    return (
        <>
            <Modal title={prompt?.title} open={Boolean(prompt)} onCancel={onClose} footer={null} width={1000}>
                {prompt ? (
                    <>
                        <div className="grid gap-5 md:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
                            <div>
                                {prompt.coverUrl ? (
                                    <LazyMediaImage
                                        src={imagePreviewUrl(prompt.coverUrl, 960)}
                                        placeholderSrc={previewUrl}
                                        loading="eager"
                                        alt={prompt.title}
                                        containerClassName="w-full rounded-lg bg-transparent"
                                        imageClassName="mx-auto block h-auto max-h-[65vh] max-w-full object-contain"
                                    />
                                ) : (
                                    <div className="flex aspect-[4/3] w-full items-center justify-center rounded-lg bg-stone-100 px-5 text-center text-sm font-medium text-stone-500 dark:bg-stone-900 dark:text-stone-400">{prompt.title}</div>
                                )}
                            </div>
                            <div className="min-w-0">
                                <div className="flex flex-wrap gap-1.5">
                                    {prompt.tags.map((tag) => (
                                        <Tag key={tag} className="m-0">
                                            {tag}
                                        </Tag>
                                    ))}
                                </div>
                                <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-stone-800 dark:text-stone-300">{prompt.prompt}</p>
                                <div className="mt-4 text-xs text-stone-500 dark:text-stone-400">
                                    创建：{formatPromptDate(prompt.createdAt)} · 更新：{formatPromptDate(prompt.updatedAt)}
                                </div>
                                <Space wrap className="mt-5">
                                    <Button type="primary" icon={<Copy className="size-4" />} onClick={() => onCopy(prompt.prompt)}>
                                        复制提示词
                                    </Button>
                                    {onSaveAsset ? (
                                        <Button icon={<FolderPlus className="size-4" />} onClick={() => onSaveAsset(prompt)}>
                                            加入我的素材
                                        </Button>
                                    ) : null}
                                </Space>
                            </div>
                        </div>
                    </>
                ) : null}
            </Modal>
        </>
    );
}
