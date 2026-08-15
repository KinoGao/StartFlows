"use client";

import { Button, Dropdown } from "antd";
import { Check, Clock3, Ellipsis, MessageSquareText, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";

import type { CreativeConversation } from "@/lib/creative-runtime-contract";

export function DramaAgentHistory({
    items,
    activeId,
    loading,
    hasMore,
    loadingMore,
    onOpen,
    onRename,
    onDelete,
    onLoadMore,
}: {
    items: CreativeConversation[];
    activeId?: string;
    loading: boolean;
    hasMore: boolean;
    loadingMore: boolean;
    onOpen: (id: string) => void;
    onRename: (id: string, title: string) => void;
    onDelete: (item: CreativeConversation) => void;
    onLoadMore: () => void;
}) {
    const [editingId, setEditingId] = useState<string>();
    const [titleDraft, setTitleDraft] = useState("");
    const startRename = (item: CreativeConversation) => {
        setEditingId(item.id);
        setTitleDraft(item.title || "新对话");
    };
    const finishRename = (item: CreativeConversation) => {
        const title = titleDraft.trim();
        if (title && title !== item.title) onRename(item.id, title);
        setEditingId(undefined);
    };

    return (
        <div className="w-[min(18rem,calc(100vw-1.5rem))] overflow-hidden p-1" data-drama-agent-history>
            <div className="flex h-8 items-center justify-between px-2">
                <span className="text-xs font-medium text-foreground">历史对话</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">{items.length} 条</span>
            </div>
            <div className="hide-scrollbar max-h-[min(18rem,calc(100dvh-8rem))] overflow-y-auto overscroll-contain">
                {loading ? <div className="px-3 py-8 text-center text-xs text-muted-foreground">正在读取...</div> : null}
                {!loading && !items.length ? <div className="px-3 py-8 text-center text-xs text-muted-foreground">暂无历史对话</div> : null}
                <div className="grid gap-0.5">
                    {items.map((item) => {
                        const active = item.id === activeId;
                        return (
                            <div
                                key={item.id}
                                className={`group flex min-h-12 w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-1.5 transition-colors ${active ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted/70"}`}
                                aria-current={active ? "true" : undefined}
                            >
                                {editingId === item.id ? (
                                    <div className="flex min-w-0 flex-1 items-center gap-1 px-1">
                                        <input
                                            autoFocus
                                            value={titleDraft}
                                            maxLength={120}
                                            className="h-8 min-w-0 flex-1 rounded-md border border-primary/40 bg-background px-2 text-xs text-foreground outline-none focus:border-primary"
                                            aria-label={`修改对话标题：${item.title || "新对话"}`}
                                            onChange={(event) => setTitleDraft(event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") finishRename(item);
                                                if (event.key === "Escape") setEditingId(undefined);
                                            }}
                                        />
                                        <Button type="text" size="small" className="!size-7 !min-w-7" icon={<Check className="size-3.5" />} onClick={() => finishRename(item)} aria-label="保存对话标题" />
                                        <Button type="text" size="small" className="!size-7 !min-w-7" icon={<X className="size-3.5" />} onClick={() => setEditingId(undefined)} aria-label="取消修改标题" />
                                    </div>
                                ) : (
                                    <>
                                        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 px-1 text-left" onClick={() => onOpen(item.id)} aria-label={`进入对话：${item.title || "新对话"}`}>
                                            <MessageSquareText className="size-3.5 shrink-0 opacity-70" aria-hidden="true" />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-xs font-medium">{item.title || "新对话"}</span>
                                                <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                                                    <Clock3 className="size-2.5" aria-hidden="true" /> {formatTime(item.lastMessageAt)}
                                                </span>
                                            </span>
                                            {active ? <Check className="size-3.5 shrink-0" aria-label="当前对话" /> : null}
                                        </button>
                                        <Dropdown
                                            trigger={["click"]}
                                            placement="bottomRight"
                                            getPopupContainer={(trigger) => trigger.parentElement || document.body}
                                            menu={{
                                                items: [
                                                    { key: "rename", icon: <Pencil className="size-3.5" />, label: "修改标题" },
                                                    { key: "delete", icon: <Trash2 className="size-3.5" />, label: "删除对话", danger: true },
                                                ],
                                                onClick: ({ key }) => (key === "rename" ? startRename(item) : onDelete(item)),
                                            }}
                                        >
                                            <Button
                                                type="text"
                                                size="small"
                                                className="!size-7 !min-w-7 !shrink-0 !text-muted-foreground opacity-70 hover:!text-foreground group-hover:opacity-100"
                                                icon={<Ellipsis className="size-3.5" />}
                                                aria-label={`管理对话：${item.title || "新对话"}`}
                                            />
                                        </Dropdown>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
                {hasMore ? (
                    <Button type="text" block size="small" className="!mt-1 !h-8 !text-xs !text-muted-foreground" loading={loadingMore} onClick={onLoadMore}>
                        加载更多
                    </Button>
                ) : null}
            </div>
        </div>
    );
}

function formatTime(value: number) {
    if (!value) return "刚刚";
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(value);
}
