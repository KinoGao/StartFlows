"use client";

import { useMemo, useState } from "react";
import { App } from "antd";
import { BookmarkPlus, Check, Search, Trash2 } from "lucide-react";
import { nanoid } from "nanoid";

import type { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { useConfigStore } from "@/flowcanvas/stores/use-config-store";
import {
    IMAGE_STYLE_CATEGORY_TABS,
    IMAGE_STYLE_PRESETS,
    customImageStyleId,
    customStyleToPreset,
    filterImageStylePresets,
    type ImageStylePreset,
    type ImageStyleTab,
} from "../utils/canvas-image-style-presets";

type CanvasImageStyleLibraryProps = {
    value: string;
    /** 当前 Composer 提示词，用于「保存为自定义风格」 */
    currentPrompt: string;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onChange: (styleId: string) => void;
};

/** 图片节点风格库弹层：分类标签 + 关键词搜索 + 自定义风格，沿用 PresetGrid 卡片视觉 */
export function CanvasImageStyleLibrary({ value, currentPrompt, theme, onChange }: CanvasImageStyleLibraryProps) {
    const { message } = App.useApp();
    const customStyles = useConfigStore((state) => state.config.customImageStyles) || [];
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const [tab, setTab] = useState<ImageStyleTab>("all");
    const [keyword, setKeyword] = useState("");
    const [styleName, setStyleName] = useState("");

    const allPresets = useMemo(() => [...IMAGE_STYLE_PRESETS, ...customStyles.map(customStyleToPreset)], [customStyles]);
    const visible = filterImageStylePresets(allPresets, tab, keyword);
    const canSave = Boolean(styleName.trim() && currentPrompt.trim());

    const saveCustomStyle = () => {
        if (!canSave) return;
        const name = styleName.trim();
        updateConfig("customImageStyles", [...customStyles, { id: nanoid(8), name, prompt: currentPrompt.trim(), createdAt: new Date().toISOString() }]);
        setStyleName("");
        setTab("custom");
        message.success(`已保存自定义风格「${name}」`);
    };

    const removeCustomStyle = (preset: ImageStylePreset) => {
        updateConfig("customImageStyles", customStyles.filter((style) => customImageStyleId(style.id) !== preset.id));
        if (value === preset.id) onChange("");
    };

    return (
        <div className="w-[430px] max-w-[calc(100vw-32px)] p-2" style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-2 px-1 pb-2">
                <span className="text-sm font-semibold">风格库</span>
                <div className="flex h-7 w-[180px] items-center gap-1.5 rounded-md border px-2" style={{ borderColor: theme.ui.hairline, background: theme.ui.controlFill }}>
                    <Search className="size-3.5 shrink-0 opacity-50" />
                    <input
                        className="w-full bg-transparent text-xs outline-none placeholder:opacity-40"
                        style={{ color: theme.node.text }}
                        placeholder="搜索风格名称或关键词"
                        value={keyword}
                        onChange={(event) => setKeyword(event.target.value)}
                        aria-label="搜索风格"
                    />
                </div>
            </div>
            <div className="flex flex-wrap gap-1.5 px-1 pb-2">
                {IMAGE_STYLE_CATEGORY_TABS.map((item) => {
                    const active = !keyword.trim() && tab === item.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            className="rounded-full border px-2.5 py-1 text-[11px] transition hover:opacity-80"
                            style={{ borderColor: active ? theme.ui.accent : theme.ui.hairline, background: active ? theme.ui.controlFill : "transparent", color: theme.node.text }}
                            onClick={() => setTab(item.id)}
                        >
                            {item.label}
                        </button>
                    );
                })}
            </div>
            {visible.length ? (
                <div className="grid max-h-[300px] grid-cols-3 gap-2 overflow-y-auto max-[480px]:grid-cols-2">
                    {visible.map((item) => (
                        <button
                            key={item.id || "default"}
                            type="button"
                            className="group relative min-h-[74px] overflow-hidden rounded-md border p-2 text-left transition hover:-translate-y-px"
                            style={{ background: item.tone, borderColor: value === item.id ? theme.ui.accent : theme.ui.hairline, color: theme.node.text }}
                            onClick={() => onChange(item.id)}
                        >
                            <span className="block pr-4 text-xs font-semibold">{item.label}</span>
                            <span className="mt-1 line-clamp-2 block text-[10px] leading-4 opacity-65">{item.description}</span>
                            {value === item.id ? <Check className="absolute right-2 top-2 size-3.5" /> : null}
                            {item.category === "custom" ? (
                                <span
                                    role="button"
                                    aria-label={`删除自定义风格 ${item.label}`}
                                    className="absolute bottom-1.5 right-1.5 rounded p-0.5 opacity-0 transition group-hover:opacity-70 hover:!opacity-100"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        removeCustomStyle(item);
                                    }}
                                >
                                    <Trash2 className="size-3" />
                                </span>
                            ) : null}
                        </button>
                    ))}
                </div>
            ) : (
                <div className="px-1 py-6 text-center text-xs" style={{ color: theme.node.muted }}>
                    {tab === "custom" && !keyword.trim() ? "还没有自定义风格，可在下方把当前提示词保存为风格" : "没有匹配的风格"}
                </div>
            )}
            <div className="mt-2 border-t px-1 pt-2" style={{ borderColor: theme.ui.hairline }}>
                <div className="flex items-center gap-1.5">
                    <input
                        className="h-7 min-w-0 flex-1 rounded-md border px-2 text-xs outline-none placeholder:opacity-40"
                        style={{ borderColor: theme.ui.hairline, background: theme.ui.controlFill, color: theme.node.text }}
                        placeholder="输入风格名，把当前提示词存为自定义风格"
                        value={styleName}
                        onChange={(event) => setStyleName(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") saveCustomStyle();
                        }}
                        aria-label="自定义风格名称"
                    />
                    <button
                        type="button"
                        className="flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-[11px] transition enabled:hover:opacity-80 disabled:opacity-40"
                        style={{ borderColor: theme.ui.hairline, background: theme.ui.controlFill, color: theme.node.text }}
                        disabled={!canSave}
                        onClick={saveCustomStyle}
                    >
                        <BookmarkPlus className="size-3" />
                        保存
                    </button>
                </div>
                <div className="pt-1.5 text-[10px] leading-4" style={{ color: theme.node.muted }}>
                    {currentPrompt.trim() ? "自定义风格保存在账号配置中，可在任意图片节点复用。" : "先在输入框写好提示词，即可保存为自定义风格。"}
                </div>
            </div>
        </div>
    );
}
