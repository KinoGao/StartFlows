"use client";

import { Check, X } from "lucide-react";

import { canvasThemes, type CanvasTheme } from "@/flowcanvas/lib/canvas-theme";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";
import type { GenerationConfirmation } from "./canvas-node-generation";

type CanvasConfirmCardProps = {
    confirmation: GenerationConfirmation;
    onConfirm: () => void;
    onCancel: () => void;
};

const KIND_LABELS: Record<string, string> = {
    image: "图片",
    video: "视频",
    audio: "音频",
    text: "文本",
};

export function CanvasConfirmCard({ confirmation, onConfirm, onCancel }: CanvasConfirmCardProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div
            className="creative-os-panel absolute left-1/2 top-1/2 z-[80] w-[340px] -translate-x-1/2 -translate-y-1/2 rounded-xl border p-4"
            style={{ background: theme.ui.materialElevated, borderColor: theme.ui.hairline, boxShadow: theme.ui.shadow, color: theme.node.text }}
        >
            <div className="mb-1 text-sm font-medium">确认生成</div>
            <div className="mb-3 line-clamp-2 text-xs" style={{ color: theme.node.muted }}>
                {confirmation.prompt || "（空提示词）"}
            </div>

            <div className="mb-3 space-y-1.5 text-[13px]">
                <ConfirmRow theme={theme} label="模型" value={confirmation.modelLabel} />
                {confirmation.mediaSpec ? <ConfirmRow theme={theme} label="规格" value={confirmation.mediaSpec} /> : null}
                <ConfirmRow theme={theme} label="数量" value={`${confirmation.count} 张`} />
                {confirmation.references.length ? (
                    <div className="flex items-start gap-2">
                        <span className="mt-0.5 w-9 shrink-0 opacity-60">参考</span>
                        <span className="flex min-w-0 flex-1 flex-wrap gap-1">
                            {confirmation.references.map((reference) => (
                                <span
                                    key={reference.nodeId}
                                    className="rounded-full border px-2 py-0.5 text-[11px]"
                                    style={{ borderColor: theme.ui.hairline, background: theme.ui.controlFill, color: theme.node.muted }}
                                >
                                    {KIND_LABELS[reference.kind] ?? reference.kind} · {reference.title || reference.label}
                                </span>
                            ))}
                        </span>
                    </div>
                ) : null}
            </div>

            <div className="flex justify-end gap-2">
                <button
                    type="button"
                    className="grid h-8 items-center gap-1 rounded-lg px-3 text-[13px] transition-colors"
                    style={{ color: theme.node.muted }}
                    onMouseEnter={(event) => (event.currentTarget.style.background = theme.toolbar.itemHover)}
                    onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
                    onClick={onCancel}
                >
                    <span className="flex items-center gap-1"><X className="size-3.5" />取消</span>
                </button>
                <button
                    type="button"
                    className="grid h-8 items-center gap-1 rounded-lg px-3 text-[13px] font-medium transition-colors"
                    style={{ background: theme.ui.accent, color: "#ffffff" }}
                    onMouseEnter={(event) => (event.currentTarget.style.filter = "brightness(1.08)")}
                    onMouseLeave={(event) => (event.currentTarget.style.filter = "none")}
                    onClick={onConfirm}
                >
                    <span className="flex items-center gap-1"><Check className="size-3.5" />生成</span>
                </button>
            </div>
        </div>
    );
}

function ConfirmRow({ theme, label, value }: { theme: CanvasTheme; label: string; value: string }) {
    return (
        <div className="flex items-center gap-2">
            <span className="w-9 shrink-0 opacity-60">{label}</span>
            <span className="min-w-0 flex-1 truncate">{value}</span>
        </div>
    );
}
