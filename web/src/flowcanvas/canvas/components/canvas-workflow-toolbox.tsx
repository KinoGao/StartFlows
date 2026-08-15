"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Input, Modal } from "antd";
import { Copy, Save, Search, Trash2 } from "lucide-react";

import { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "../types";
import type { CanvasWorkflowTemplate } from "../utils/canvas-workflow-template";

const TYPE_FILTERS = [
    { type: CanvasNodeType.Image, label: "图片" },
    { type: CanvasNodeType.Video, label: "视频" },
    { type: CanvasNodeType.Audio, label: "音频" },
    { type: CanvasNodeType.Text, label: "文本" },
    { type: CanvasNodeType.ComfyUI, label: "工作流" },
    { type: CanvasNodeType.Group, label: "分组" },
] as const;

export function CanvasWorkflowToolbox({
    open,
    templates,
    loading = false,
    selectedCount,
    onClose,
    onSaveSelection,
    onInsert,
    onDelete,
}: {
    open: boolean;
    templates: CanvasWorkflowTemplate[];
    loading?: boolean;
    selectedCount: number;
    onClose: () => void;
    onSaveSelection: (name: string) => Promise<CanvasWorkflowTemplate | null>;
    onInsert: (template: CanvasWorkflowTemplate) => void;
    onDelete: (templateId: string) => void;
}) {
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];
    const [name, setName] = useState("");
    const [createdId, setCreatedId] = useState<string | null>(null);
    const [query, setQuery] = useState("");
    const [typeFilter, setTypeFilter] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            setName("");
            setCreatedId(null);
            setQuery("");
            setTypeFilter(null);
        }
    }, [open]);

    const availableTypes = useMemo(() => {
        const present = new Set(templates.flatMap((template) => template.nodes.map((node) => node.type)));
        return TYPE_FILTERS.filter((item) => present.has(item.type));
    }, [templates]);

    const filteredTemplates = useMemo(() => {
        const keyword = query.trim().toLowerCase();
        return templates.filter((template) => {
            if (keyword && !template.name.toLowerCase().includes(keyword)) return false;
            if (typeFilter && !template.nodes.some((node) => node.type === typeFilter)) return false;
            return true;
        });
    }, [query, templates, typeFilter]);

    const save = async () => {
        if (!selectedCount) return;
        const template = await onSaveSelection(name || "");
        if (template) setCreatedId(template.id);
    };

    return (
        <Modal title="工作流工具箱" open={open} centered width={720} footer={null} onCancel={onClose} destroyOnHidden styles={{ body: { background: theme.node.panel, color: theme.node.text } }}>
            <div className="mb-3 flex items-center gap-2">
                <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={`将选中的 ${selectedCount} 个节点保存为模板`} allowClear disabled={!selectedCount} onPressEnter={save} />
                <Button type="primary" icon={<Save className="size-4" />} disabled={!selectedCount} onClick={save}>
                    保存选中
                </Button>
            </div>
            <div className="mb-3 flex items-center gap-2">
                <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="搜索模板"
                    allowClear
                    prefix={<Search className="size-3.5 opacity-45" />}
                    className="max-w-56"
                />
                <div className="thin-scrollbar flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
                    <FilterChip active={!typeFilter} theme={theme} onClick={() => setTypeFilter(null)}>
                        全部
                    </FilterChip>
                    {availableTypes.map((item) => (
                        <FilterChip key={item.type} active={typeFilter === item.type} theme={theme} onClick={() => setTypeFilter(typeFilter === item.type ? null : item.type)}>
                            {item.label}
                        </FilterChip>
                    ))}
                </div>
            </div>
            <div className="thin-scrollbar max-h-[380px] overflow-y-auto pr-1">
                {!filteredTemplates.length ? (
                    <div className="rounded-lg border border-dashed py-10 text-center text-xs opacity-55" style={{ borderColor: theme.toolbar.border }}>
                        {loading ? "正在加载模板..." : templates.length ? "没有匹配的模板，换个关键词或筛选条件试试。" : "还没有模板。选中画布上的一组节点后，输入名称点「保存选中」。"}
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                        {filteredTemplates.map((template) => (
                            <div
                                key={template.id}
                                className="group flex flex-col overflow-hidden rounded-xl border transition"
                                style={{ borderColor: template.id === createdId ? theme.ui.accent : theme.toolbar.border, background: theme.node.fill }}
                            >
                                <TemplatePreview nodes={template.nodes} accent={theme.ui.accent} />
                                <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-2.5 pt-2">
                                    <div className="truncate text-[13px] font-medium">{template.name}</div>
                                    <div className="text-[11px] opacity-55">
                                        {template.nodes.length} 个节点 · {template.connections.length} 条连线
                                    </div>
                                </div>
                                <div className="flex items-center justify-between gap-1 px-2 py-2">
                                    <Button size="small" type="primary" icon={<Copy className="size-3.5" />} onClick={() => onInsert(template)}>
                                        插入画布
                                    </Button>
                                    <Button size="small" type="text" danger icon={<Trash2 className="size-3.5" />} onClick={() => onDelete(template.id)} aria-label={`删除模板 ${template.name}`} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </Modal>
    );
}

function FilterChip({ active, theme, onClick, children }: { active: boolean; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onClick: () => void; children: string }) {
    return (
        <button
            type="button"
            className="shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition"
            style={
                active
                    ? { background: theme.ui.accentSoft, borderColor: theme.ui.accent, color: theme.ui.accent }
                    : { background: "transparent", borderColor: theme.toolbar.border, color: theme.node.muted }
            }
            onClick={onClick}
        >
            {children}
        </button>
    );
}

/** 模板缩略预览：把模板内节点按相对位置缩放到小画幅，近似 LibTV/TapNow 卡片缩略图。 */
function TemplatePreview({ nodes, accent }: { nodes: CanvasNodeData[]; accent: string }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const layout = useMemo(() => {
        if (!nodes.length) return null;
        const bounds = nodes.reduce(
            (acc, node) => ({
                left: Math.min(acc.left, node.position.x),
                top: Math.min(acc.top, node.position.y),
                right: Math.max(acc.right, node.position.x + node.width),
                bottom: Math.max(acc.bottom, node.position.y + node.height),
            }),
            { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity },
        );
        const width = Math.max(1, bounds.right - bounds.left);
        const height = Math.max(1, bounds.bottom - bounds.top);
        return { bounds, width, height };
    }, [nodes]);

    return (
        <div className="relative h-20 overflow-hidden" style={{ background: theme.canvas.background }}>
            {layout
                ? nodes.map((node) => (
                      <span
                          key={node.id}
                          className="absolute rounded-[2px]"
                          style={{
                              left: `${(((node.position.x - layout.bounds.left) / layout.width) * 88 + 6).toFixed(2)}%`,
                              top: `${(((node.position.y - layout.bounds.top) / layout.height) * 76 + 12).toFixed(2)}%`,
                              width: `${Math.max(3, (node.width / layout.width) * 88).toFixed(2)}%`,
                              height: `${Math.max(6, (node.height / layout.height) * 76).toFixed(2)}%`,
                              background: node.type === CanvasNodeType.Group ? "transparent" : accent,
                              border: `1px solid ${accent}`,
                              opacity: node.type === CanvasNodeType.Group ? 0.55 : 0.8,
                          }}
                      />
                  ))
                : null}
        </div>
    );
}
