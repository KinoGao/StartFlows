"use client";

import { History, Redo2, Undo2 } from "lucide-react";

import { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";

export type CanvasHistoryPanelEntry = {
    /** 在 past 栈中的下标，用于跳转 */
    index: number;
    label: string;
    at?: number;
};

/** 历史记录面板（对齐 LibTV 底部工具栏「历史记录」）：列出可回跳的历史快照，点击跳转到该状态。 */
export function CanvasHistoryPanel({
    entries,
    canUndo,
    canRedo,
    onJump,
    onUndo,
    onRedo,
}: {
    entries: CanvasHistoryPanelEntry[];
    canUndo: boolean;
    canRedo: boolean;
    onJump: (index: number) => void;
    onUndo: () => void;
    onRedo: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const ordered = [...entries].reverse();

    return (
        <div className="w-[248px] max-w-[calc(100vw-32px)] p-2" style={{ color: theme.node.text }}>
            <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-sm font-semibold">历史记录</span>
                <span className="flex items-center gap-1">
                    <button
                        type="button"
                        disabled={!canUndo}
                        className="creative-os-icon-button !size-7 disabled:opacity-35"
                        style={{ color: theme.toolbar.item }}
                        onClick={onUndo}
                        aria-label="撤销"
                    >
                        <Undo2 className="size-3.5" />
                    </button>
                    <button
                        type="button"
                        disabled={!canRedo}
                        className="creative-os-icon-button !size-7 disabled:opacity-35"
                        style={{ color: theme.toolbar.item }}
                        onClick={onRedo}
                        aria-label="重做"
                    >
                        <Redo2 className="size-3.5" />
                    </button>
                </span>
            </div>
            <div className="thin-scrollbar max-h-[300px] overflow-y-auto">
                <div className="flex h-8 items-center gap-2 rounded-md px-2 text-xs font-medium" style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}>
                    <History className="size-3.5 shrink-0" />
                    当前状态
                </div>
                {ordered.length ? (
                    ordered.map((entry) => (
                        <button
                            key={entry.index}
                            type="button"
                            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition hover:brightness-125"
                            style={{ color: theme.node.text }}
                            onClick={() => onJump(entry.index)}
                        >
                            <History className="size-3.5 shrink-0 opacity-45" />
                            <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                            <span className="shrink-0 text-[10px] tabular-nums opacity-40">{entry.at ? new Date(entry.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : ""}</span>
                        </button>
                    ))
                ) : (
                    <div className="px-2 py-3 text-[11px] leading-4 opacity-45">暂无可回退的操作。画布上的新增、删除、连线与编辑会记录在这里。</div>
                )}
            </div>
        </div>
    );
}
