"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "../types";

/** 按标题 / Prompt / 文本内容过滤节点：多字段拼接后大小写不敏感匹配；空白查询返回空数组。 */
export function filterNodesByQuery(nodes: CanvasNodeData[], query: string): CanvasNodeData[] {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return nodes.filter((node) => {
        const metadata = node.metadata;
        const haystack = [
            node.title,
            metadata?.content,
            metadata?.prompt,
            metadata?.requestPrompt,
            metadata?.composerContent,
        ]
            .filter((value): value is string => Boolean(value))
            .join("\n")
            .toLowerCase();
        return haystack.includes(q);
    });
}

const NODE_TYPE_LABELS: Partial<Record<CanvasNodeType, string>> = {
    [CanvasNodeType.Text]: "文字",
    [CanvasNodeType.Image]: "图片",
    [CanvasNodeType.Video]: "视频",
    [CanvasNodeType.Audio]: "音频",
    [CanvasNodeType.Group]: "分组",
    [CanvasNodeType.ComfyUI]: "工作流",
    [CanvasNodeType.Config]: "配置",
};

export function CanvasSearchPanel({
    open,
    nodes,
    onClose,
    onLocateNode,
}: {
    open: boolean;
    nodes: CanvasNodeData[];
    onClose: () => void;
    onLocateNode: (nodeId: string) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState("");

    useEffect(() => {
        if (!open) return;
        setQuery("");
        const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
        return () => window.clearTimeout(timer);
    }, [open]);

    const results = useMemo(() => filterNodesByQuery(nodes, query), [nodes, query]);

    if (!open) return null;

    return (
        <div
            className="creative-os-panel absolute right-3 top-[68px] z-[65] w-[340px] max-w-[calc(100vw-48px)] overflow-hidden rounded-lg border"
            style={{ background: theme.ui.materialElevated, borderColor: theme.ui.hairline, boxShadow: theme.ui.shadow, color: theme.node.text }}
        >
            <div className="flex items-center gap-2 border-b px-3 py-2" style={{ borderColor: theme.ui.hairline }}>
                <Search className="size-4 shrink-0 opacity-60" />
                <input
                    ref={inputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") onClose();
                        if (event.key === "Enter" && results[0]) {
                            onLocateNode(results[0].id);
                            onClose();
                        }
                    }}
                    placeholder="搜索节点标题 / Prompt / 文本…"
                    className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:opacity-40"
                    style={{ color: theme.node.text }}
                />
                <button type="button" onClick={onClose} aria-label="关闭搜索" className="grid size-6 place-items-center rounded opacity-60 transition-opacity hover:opacity-100">
                    <X className="size-4" />
                </button>
            </div>
            <div className="max-h-72 overflow-y-auto p-1">
                {query.trim() === "" ? (
                    <div className="px-2 py-3 text-center text-xs opacity-50">输入关键词搜索节点（⌘F / Ctrl+F）</div>
                ) : results.length === 0 ? (
                    <div className="px-2 py-3 text-center text-xs opacity-50">未找到匹配节点</div>
                ) : (
                    results.map((node) => (
                        <button
                            key={node.id}
                            type="button"
                            className="creative-os-menu-item flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors"
                            style={{ color: theme.node.text }}
                            onMouseEnter={(event) => (event.currentTarget.style.background = theme.toolbar.itemHover)}
                            onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
                            onClick={() => {
                                onLocateNode(node.id);
                                onClose();
                            }}
                        >
                            <span className="shrink-0 opacity-60">{NODE_TYPE_LABELS[node.type] ?? node.type}</span>
                            <span className="min-w-0 flex-1 truncate">{node.title || "未命名节点"}</span>
                        </button>
                    ))
                )}
            </div>
        </div>
    );
}
