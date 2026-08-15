import { Fragment, useMemo, useState } from "react";
import { Button, Dropdown, Select } from "antd";
import { Clapperboard, Download, Image as ImageIcon, ListOrdered, Plus, Sparkles, Upload, Workflow, X } from "lucide-react";

import type { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { buildScriptBeats } from "../utils/canvas-script-beats";
import type { CanvasNodeData, CanvasNodeMetadata, CanvasScriptAct, CanvasScriptAsset, CanvasScriptBeat } from "../types";

type Theme = (typeof canvasThemes)[keyof typeof canvasThemes];
export type ScriptOutputState = "idle" | "loading" | "success" | "error";

const SCRIPT_OUTPUT_STATUS_MARK = {
    idle: "—",
    loading: "生成中…",
    success: "✓",
    error: "✗",
} as const;

function stopCanvasPanelInteraction(event: { stopPropagation(): void }) {
    event.stopPropagation();
}

/**
 * 脚本节点全屏工作台（对齐导演台模式）：剧本编辑 + 资产（人物/道具/场景，可生成资产图）
 * + 分镜表（逐镜微调、逐镜生成）。生成什么就从脚本节点输出什么，工作台内可见生成状态。
 */
export function ScriptDeskStudio({
    node,
    theme,
    onClose,
    onChange,
    onAiAnalyze,
    onReparse,
    onImportUpstream,
    hasUpstreamText,
    onBeatChange,
    onBeatAdd,
    onBeatRemove,
    onBeatMove,
    onAssetChange,
    onAssetAdd,
    onAssetRemove,
    onGenerateBeat,
    onGenerateAsset,
    onExportBeats,
    outputStates,
}: {
    node: CanvasNodeData;
    theme: Theme;
    onClose: () => void;
    onChange: (patch: Partial<CanvasNodeMetadata>) => void;
    onAiAnalyze: () => void;
    onReparse: () => void;
    onImportUpstream: () => void;
    hasUpstreamText: boolean;
    onBeatChange: (beat: CanvasScriptBeat) => void;
    onBeatAdd: (index: number) => void;
    onBeatRemove: (index: number) => void;
    onBeatMove: (index: number, direction: -1 | 1) => void;
    onAssetChange: (asset: CanvasScriptAsset) => void;
    onAssetAdd: (asset: CanvasScriptAsset) => void;
    onAssetRemove: (assetId: string) => void;
    onGenerateBeat: (beat: CanvasScriptBeat, index: number, target: "video" | "comfyui") => void;
    onGenerateAsset: (asset: CanvasScriptAsset, target: "image" | "comfyui") => void;
    onExportBeats: (target: "video" | "comfyui") => void;
    outputStates: Record<string, ScriptOutputState>;
}) {
    const body = node.metadata?.scriptBody ?? node.metadata?.content ?? "";
    const beats = node.metadata?.scriptBeats?.length ? node.metadata.scriptBeats : buildScriptBeats(body);
    const acts = node.metadata?.scriptActs ?? [];
    const assets = node.metadata?.scriptAssets ?? [];
    const fieldStyle = { background: theme.node.fill, borderColor: theme.toolbar.border, color: theme.node.text };
    const [editingIndex, setEditingIndex] = useState<number | null>(null);
    const [draft, setDraft] = useState<CanvasScriptBeat | null>(null);
    const [newAsset, setNewAsset] = useState<{ kind: CanvasScriptAsset["kind"]; name: string }>({ kind: "character", name: "" });
    const updateBody = (scriptBody: string) => onChange({ scriptBody, content: scriptBody, status: scriptBody.trim() ? "success" : "idle" });
    // 正文含明确镜行编号（SH/SC/镜 N）时可本地重拆，不消耗模型
    const canReparse = /(^|\n)\s*(SH|SC|镜)\s*\d+/i.test(body);

    const startEdit = (beat: CanvasScriptBeat, index: number) => {
        setEditingIndex(index);
        setDraft({ ...beat });
    };
    const saveEdit = () => {
        if (draft) onBeatChange(draft);
        setEditingIndex(null);
        setDraft(null);
    };

    // 按幕分组：有幕信息时先显示幕标题行，再渲染该幕的分镜；无幕信息时全部归入「未分幕」。
    // 幕匹配先做精确匹配，失败再做归一化/前缀容错（如 beat 写「第一幕」而 acts 标题是「第一幕《探测」」）。
    const actGroups = useMemo(() => {
        const groups: Array<{ actTitle: string; act?: (typeof acts)[number]; beats: Array<{ beat: CanvasScriptBeat; index: number }> }> = [];
        const actByTitle = new Map(acts.map((act) => [act.title, act]));
        const normalize = (value: string) => value.replace(/[\s「」《》]/g, "");
        const findAct = (actTitle: string) => {
            const direct = actByTitle.get(actTitle);
            if (direct) return direct;
            const target = normalize(actTitle);
            if (!target) return undefined;
            return acts.find((act) => {
                const current = normalize(act.title);
                return current === target || current.startsWith(target) || target.startsWith(current);
            });
        };
        const order: string[] = [];
        const buckets = new Map<string, Array<{ beat: CanvasScriptBeat; index: number }>>();
        beats.forEach((beat, index) => {
            const actTitle = beat.act?.trim() || "";
            if (!buckets.has(actTitle)) {
                buckets.set(actTitle, []);
                order.push(actTitle);
            }
            buckets.get(actTitle)!.push({ beat, index });
        });
        order.forEach((actTitle) => {
            groups.push({
                actTitle: actTitle || "未分幕",
                act: findAct(actTitle),
                beats: buckets.get(actTitle) || [],
            });
        });
        return groups;
    }, [acts, beats]);
    const patchDraft = (patch: Partial<CanvasScriptBeat>) => setDraft((current) => (current ? { ...current, ...patch } : current));
    const assetLabel = (kind: CanvasScriptAsset["kind"]) => (kind === "character" ? "人物" : kind === "scene" ? "场景" : "道具");

    return (
        <div className="fixed inset-0 z-[220] flex flex-col" style={{ background: theme.node.panel, color: theme.node.text }} data-canvas-no-zoom>
            <div className="flex h-14 shrink-0 items-center justify-between border-b px-5" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                <div className="flex items-center gap-3">
                    <div className="text-sm font-semibold">脚本工作台</div>
                    <div className="text-xs opacity-45">{node.title || "脚本"}</div>
                </div>
                <div className="flex items-center gap-2">
                    <Button type="primary" icon={<Sparkles className="size-4" />} onClick={onAiAnalyze} disabled={!body.trim()}>
                        AI 拆解
                    </Button>
                    <Button icon={<ListOrdered className="size-4" />} onClick={onReparse} disabled={!canReparse} title="按正文里的幕/场/镜编号本地重建分镜表，不消耗模型">
                        按正文重拆
                    </Button>
                    {hasUpstreamText ? (
                        <Button icon={<Upload className="size-4" />} onClick={onImportUpstream}>
                            从上游导入
                        </Button>
                    ) : null}
                    <Dropdown
                        menu={{
                            items: [
                                { key: "video", label: "导出为视频节点", icon: <Clapperboard className="size-3.5" /> },
                                { key: "comfyui", label: "导出为 ComfyUI 节点", icon: <Workflow className="size-3.5" /> },
                            ],
                            onClick: ({ key }) => onExportBeats(key as "video" | "comfyui"),
                        }}
                        disabled={!beats.length}
                    >
                        <Button icon={<Download className="size-4" />}>导出</Button>
                    </Dropdown>
                    <Button type="text" shape="circle" icon={<X className="size-4" />} onClick={onClose} aria-label="关闭脚本工作台" />
                </div>
            </div>
            <div className="grid min-h-0 flex-1 grid-cols-[380px_1fr] gap-0">
                <div className="thin-scrollbar flex min-h-0 flex-col gap-3 overflow-y-auto border-r p-4" style={{ borderColor: theme.toolbar.border }}>
                    <label className="nodrag nopan block min-w-0" onMouseDownCapture={stopCanvasPanelInteraction} onPointerDownCapture={stopCanvasPanelInteraction} onClickCapture={(event) => event.stopPropagation()}>
                        <span className="mb-1 block text-xs opacity-55">标题</span>
                        <input className="h-9 w-full rounded-lg border px-3 text-sm outline-none placeholder:opacity-35" value={node.metadata?.scriptTitle || node.title || ""} placeholder="短片标题 / 分镜脚本名" onChange={(event) => onChange({ scriptTitle: event.target.value })} style={fieldStyle} />
                    </label>
                    <label className="nodrag nopan block min-w-0" onMouseDownCapture={stopCanvasPanelInteraction} onPointerDownCapture={stopCanvasPanelInteraction} onClickCapture={(event) => event.stopPropagation()}>
                        <span className="mb-1 block text-xs opacity-55">一句话梗概</span>
                        <input className="h-9 w-full rounded-lg border px-3 text-sm outline-none placeholder:opacity-35" value={node.metadata?.scriptLogline || ""} placeholder="角色、目标、冲突和转折" onChange={(event) => onChange({ scriptLogline: event.target.value })} style={fieldStyle} />
                    </label>
                    <label className="nodrag nopan block min-w-0" onMouseDownCapture={stopCanvasPanelInteraction} onPointerDownCapture={stopCanvasPanelInteraction} onClickCapture={(event) => event.stopPropagation()}>
                        <span className="mb-1 block text-xs opacity-55">剧本正文</span>
                        <textarea className="thin-scrollbar h-52 w-full resize-none rounded-lg border px-3 py-2 text-sm leading-6 outline-none placeholder:opacity-35" value={body} placeholder="按幕、段落或镜头写下脚本内容" onChange={(event) => updateBody(event.target.value)} style={fieldStyle} />
                    </label>
                    <div className="text-[11px] leading-5 opacity-45">连接上游文本节点可自动读取剧本；AI 拆解按「人物 → 道具 → 场景」提取资产后再拆分镜。</div>

                    <div className="mt-1">
                        <div className="mb-2 flex items-center justify-between">
                            <div className="text-xs font-medium opacity-65">资产（人物 / 道具 / 场景）</div>
                            <div className="text-[11px] opacity-45">{assets.length} 项</div>
                        </div>
                        <div className="thin-scrollbar max-h-72 space-y-2 overflow-y-auto pr-1">
                            {assets.map((asset) => {
                                const state = outputStates[asset.id] || "idle";
                                return (
                                    <div key={asset.id} className="rounded-xl border p-2.5" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                                        <div className="flex items-center gap-2">
                                            <span className="w-12 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px]" style={{ background: theme.node.fill }}>
                                                {assetLabel(asset.kind)}
                                            </span>
                                            <input className="h-7 w-28 min-w-0 rounded border px-2 text-xs outline-none" value={asset.name} placeholder="名称" onChange={(event) => onAssetChange({ ...asset, name: event.target.value })} style={fieldStyle} />
                                            <span className="shrink-0 text-xs" style={{ color: state === "success" ? theme.connection.activeColor : state === "loading" ? theme.ui.accent : theme.node.muted }}>
                                                {SCRIPT_OUTPUT_STATUS_MARK[state]}
                                            </span>
                                            <button type="button" className="shrink-0 text-xs opacity-50 transition hover:opacity-100" onClick={() => onAssetRemove(asset.id)}>
                                                删除
                                            </button>
                                        </div>
                                        <textarea className="mt-1.5 h-12 w-full resize-none rounded border px-2 py-1 text-xs leading-4 outline-none" value={asset.description} placeholder="外观/环境描述" onChange={(event) => onAssetChange({ ...asset, description: event.target.value })} style={fieldStyle} />
                                        <div className="mt-1.5 flex justify-end">
                                            <Dropdown
                                                menu={{
                                                    items: [
                                                        { key: "image", label: "图片节点生成", icon: <ImageIcon className="size-3.5" /> },
                                                        { key: "comfyui", label: "ComfyUI 生成", icon: <Workflow className="size-3.5" /> },
                                                    ],
                                                    onClick: ({ key }) => onGenerateAsset(asset, key as "image" | "comfyui"),
                                                }}
                                                disabled={!asset.name.trim()}
                                            >
                                                <Button size="small" type="primary" ghost>
                                                    生成资产图
                                                </Button>
                                            </Dropdown>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <Select size="small" style={{ width: 84 }} value={newAsset.kind} onChange={(kind) => setNewAsset((current) => ({ ...current, kind }))} options={[{ value: "character", label: "人物" }, { value: "prop", label: "道具" }, { value: "scene", label: "场景" }]} />
                            <input className="h-7 min-w-0 flex-1 rounded border px-2 text-xs outline-none" value={newAsset.name} placeholder="资产名称" onChange={(event) => setNewAsset((current) => ({ ...current, name: event.target.value }))} style={fieldStyle} />
                            <Button size="small" icon={<Plus className="size-3.5" />} disabled={!newAsset.name.trim()} onClick={() => {
                                onAssetAdd({ id: `asset-${Date.now()}`, kind: newAsset.kind, name: newAsset.name.trim(), description: "" });
                                setNewAsset({ kind: "character", name: "" });
                            }}>
                                添加
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="flex min-h-0 flex-col p-4">
                    <div className="mb-2 flex items-center justify-between">
                        <div className="text-sm font-medium opacity-70">分镜表</div>
                        <div className="text-xs opacity-45">{beats.length} 个分镜 · 逐镜点「生成」选视频 / ComfyUI 节点，或「导出」批量创建节点</div>
                    </div>
                    <div className="thin-scrollbar min-h-0 flex-1 overflow-auto rounded-xl border" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                        <table className="w-full border-collapse text-left text-xs">
                            <thead>
                                <tr className="opacity-50" style={{ borderBottom: `1px solid ${theme.toolbar.border}` }}>
                                    <th className="w-8 px-3 py-2 font-medium">#</th>
                                    <th className="w-16 px-2 py-2 font-medium">景别</th>
                                    <th className="w-14 px-2 py-2 font-medium">时长</th>
                                    <th className="min-w-56 px-2 py-2 font-medium">画面描述</th>
                                    <th className="w-40 px-2 py-2 font-medium">角色 / 场景 / 机位</th>
                                    <th className="w-16 px-2 py-2 font-medium">状态</th>
                                    <th className="w-44 px-3 py-2 font-medium">操作</th>
                                </tr>
                            </thead>
                            <tbody>
                                {actGroups.map((group) => (
                                    <Fragment key={group.actTitle}>
                                        <tr style={{ background: theme.ui.controlFill }}>
                                            <td colSpan={7} className="px-3 py-1.5 font-semibold">
                                                <span className="opacity-80">{group.actTitle}</span>
                                                {group.act?.name ? <span className="ml-2 opacity-60">{group.act.name}</span> : null}
                                                {group.act?.duration ? <span className="ml-2 text-[11px] opacity-45">{group.act.duration}</span> : null}
                                                <span className="ml-2 text-[11px] opacity-45">{group.beats.length} 镜</span>
                                                {group.act?.summary ? <div className="mt-0.5 text-[11px] leading-4 opacity-45">{group.act.summary}</div> : null}
                                            </td>
                                        </tr>
                                        {group.beats.map(({ beat, index }, groupIndex) => {
                                            const state = outputStates[beat.id] || "idle";
                                            const showSceneHeading = Boolean(beat.sceneHeading) && beat.sceneHeading !== group.beats[groupIndex - 1]?.beat.sceneHeading;
                                            return (
                                                <Fragment key={beat.id}>
                                                    {showSceneHeading ? (
                                                        <tr style={{ borderTop: `1px solid ${theme.toolbar.border}` }}>
                                                            <td colSpan={7} className="px-3 py-1 text-[11px] opacity-50">
                                                                {beat.sceneHeading}
                                                            </td>
                                                        </tr>
                                                    ) : null}
                                                    <tr className="align-top" style={{ borderTop: `1px solid ${theme.toolbar.border}` }}>
                                                        <td className="px-3 py-2 opacity-55">{index + 1}</td>
                                                        <td className="px-2 py-2">{beat.shotType || "—"}</td>
                                                        <td className="px-2 py-2">{beat.duration || "—"}</td>
                                                        <td className="px-2 py-2">
                                                            <div className="font-medium">{beat.title}</div>
                                                            <div className="mt-0.5 line-clamp-2 leading-5 opacity-60">{beat.content}</div>
                                                        </td>
                                                        <td className="px-2 py-2">
                                                            <div className="truncate opacity-70">{beat.character || "—"}</div>
                                                            <div className="mt-0.5 truncate opacity-50">{beat.scene || "—"}</div>
                                                            <div className="mt-0.5 truncate opacity-50">{beat.camera || "—"}</div>
                                                        </td>
                                                        <td className="px-2 py-2" style={{ color: state === "success" ? theme.connection.activeColor : state === "loading" ? theme.ui.accent : state === "error" ? "#ef4444" : theme.node.muted }}>
                                                            {SCRIPT_OUTPUT_STATUS_MARK[state]}
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <div className="flex flex-wrap items-center gap-1">
                                                                <Dropdown
                                                                    menu={{
                                                                        items: [
                                                                            { key: "video", label: "视频节点", icon: <Clapperboard className="size-3.5" /> },
                                                                            { key: "comfyui", label: "ComfyUI 节点", icon: <Workflow className="size-3.5" /> },
                                                                        ],
                                                                        onClick: ({ key }) => onGenerateBeat(beat, index, key as "video" | "comfyui"),
                                                                    }}
                                                                    disabled={!beat.content.trim() && !beat.title.trim()}
                                                                >
                                                                    <Button size="small" type="primary" ghost>
                                                                        生成
                                                                    </Button>
                                                                </Dropdown>
                                                                <Button size="small" onClick={() => startEdit(beat, index)}>
                                                                    编辑
                                                                </Button>
                                                                <button type="button" className="px-0.5 opacity-50 transition hover:opacity-100 disabled:opacity-20" disabled={index === 0} onClick={() => onBeatMove(index, -1)} aria-label="上移">↑</button>
                                                                <button type="button" className="px-0.5 opacity-50 transition hover:opacity-100 disabled:opacity-20" disabled={index === beats.length - 1} onClick={() => onBeatMove(index, 1)} aria-label="下移">↓</button>
                                                                <button type="button" className="px-0.5 opacity-50 transition hover:opacity-100" onClick={() => onBeatRemove(index)} aria-label="删除分镜">删</button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                    {editingIndex === index && draft ? (
                                                        <tr style={{ borderTop: `1px solid ${theme.toolbar.border}` }}>
                                                            <td colSpan={7} className="px-3 py-2">
                                                                <div className="space-y-1.5">
                                                                    <input className="h-7 w-full rounded border px-2 text-xs outline-none" value={draft.title} placeholder="分镜标题" onChange={(event) => patchDraft({ title: event.target.value })} style={fieldStyle} />
                                                                    <textarea className="h-16 w-full resize-none rounded border px-2 py-1 text-xs leading-5 outline-none" value={draft.content} placeholder="画面描述" onChange={(event) => patchDraft({ content: event.target.value })} style={fieldStyle} />
                                                                    <div className="grid grid-cols-3 gap-1.5">
                                                                        <input className="h-7 rounded border px-2 text-xs outline-none" value={draft.shotType || ""} placeholder="景别" onChange={(event) => patchDraft({ shotType: event.target.value })} style={fieldStyle} />
                                                                        <input className="h-7 rounded border px-2 text-xs outline-none" value={draft.duration || ""} placeholder="时长 3s" onChange={(event) => patchDraft({ duration: event.target.value })} style={fieldStyle} />
                                                                        <input className="h-7 rounded border px-2 text-xs outline-none" value={draft.camera || ""} placeholder="机位" onChange={(event) => patchDraft({ camera: event.target.value })} style={fieldStyle} />
                                                                    </div>
                                                                    <div className="grid grid-cols-2 gap-1.5">
                                                                        <input className="h-7 rounded border px-2 text-xs outline-none" value={draft.character || ""} placeholder="角色（引用资产名）" onChange={(event) => patchDraft({ character: event.target.value })} style={fieldStyle} />
                                                                        <input className="h-7 rounded border px-2 text-xs outline-none" value={draft.scene || ""} placeholder="场景（引用资产名）" onChange={(event) => patchDraft({ scene: event.target.value })} style={fieldStyle} />
                                                                    </div>
                                                                    <input className="h-7 w-full rounded border px-2 text-xs outline-none" value={draft.dialogue || ""} placeholder="台词（无则留空）" onChange={(event) => patchDraft({ dialogue: event.target.value })} style={fieldStyle} />
                                                                    <div className="flex justify-end gap-2">
                                                                        <Button size="small" onClick={() => setEditingIndex(null)}>取消</Button>
                                                                        <Button size="small" type="primary" onClick={saveEdit}>保存</Button>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ) : null}
                                                </Fragment>
                                            );
                                        })}
                                    </Fragment>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <div className="mt-2">
                        <Button size="small" block icon={<Plus className="size-3.5" />} onClick={() => onBeatAdd(beats.length - 1)}>
                            新增分镜
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
