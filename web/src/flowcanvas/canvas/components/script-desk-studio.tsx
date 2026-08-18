import { useMemo, useState } from "react";
import { AutoComplete, Button, Checkbox, Dropdown, Modal, Popconfirm, Select } from "antd";
import { ChevronDown, ChevronRight, Clapperboard, Download, Image as ImageIcon, ListOrdered, Plus, Sparkles, Upload, Workflow, X } from "lucide-react";

import type { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { buildScriptBeats } from "../utils/canvas-script-beats";
import { resolveScriptBeatImagePrompt, resolveScriptBeatVideoPrompt } from "../utils/canvas-script-ai";
import { resolveScriptBeatReferenceIds } from "../utils/canvas-script-references";
import type { CanvasNodeData, CanvasNodeMetadata, CanvasScriptAct, CanvasScriptAsset, CanvasScriptBeat } from "../types";

type Theme = (typeof canvasThemes)[keyof typeof canvasThemes];
export type ScriptOutputState = "idle" | "loading" | "success" | "error";
/** 画布上可作为分镜参考图的图片节点摘要 */
export type ScriptReferenceOption = { id: string; title: string; url: string };

const SCRIPT_OUTPUT_STATUS = {
    idle: { label: "待生成", color: "#8a8f98" },
    loading: { label: "生成中", color: "#3b82f6" },
    success: { label: "已完成", color: "#22c55e" },
    error: { label: "失败", color: "#ef4444" },
} as const;

function statusTagStyle(color: string) {
    return { color, background: `${color}1f`, border: `1px solid ${color}59` };
}

function stopCanvasPanelInteraction(event: { stopPropagation(): void }) {
    event.stopPropagation();
}

const ACT_UNASSIGNED = "__unassigned__";

const SHOT_TYPE_OPTIONS = ["大远景", "远景", "全景", "中远景", "中景", "中近景", "近景", "特写", "大特写", "头肩景", "半身景", "全身景"].map((value) => ({ value }));
const DURATION_OPTIONS = ["3s", "5s", "6s", "8s", "10s", "15s"].map((value) => ({ value }));
const CAMERA_OPTIONS = ["固定", "推镜", "拉镜", "摇镜", "跟镜", "环绕", "俯拍", "仰拍", "升降", "横移"].map((value) => ({ value }));
const COLOR_MARKS: Array<{ value: NonNullable<CanvasScriptBeat["colorMark"]>; label: string; color: string }> = [
    { value: "red", label: "红", color: "#ef4444" },
    { value: "yellow", label: "黄", color: "#eab308" },
    { value: "green", label: "绿", color: "#22c55e" },
    { value: "blue", label: "蓝", color: "#3b82f6" },
    { value: "gray", label: "灰", color: "#8a8f98" },
];

/**
 * 脚本节点全屏工作台（对齐短剧分镜脚本模式）：左侧剧本 + 资产，右侧按幕分组的分镜卡片，
 * 折叠预览 / 展开行内编辑，逐镜生成状态徽章，幕可新增、改名、定向插入分镜。
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
    onGenerateAllAssets,
    onSynthesizeBeat,
    onExportBeats,
    onStitchFrames,
    priceEstimates,
    outputStates,
    referenceOptions,
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
    onBeatAdd: (index: number, act?: string) => void;
    onBeatRemove: (index: number) => void;
    onBeatMove: (index: number, direction: -1 | 1) => void;
    onAssetChange: (asset: CanvasScriptAsset) => void;
    onAssetAdd: (asset: CanvasScriptAsset) => void;
    onAssetRemove: (assetId: string) => void;
    onGenerateBeat: (beat: CanvasScriptBeat, index: number, target: "video" | "comfyui" | "image") => void;
    onGenerateAsset: (asset: CanvasScriptAsset, target: "image" | "comfyui") => void;
    onGenerateAllAssets: () => void;
    onSynthesizeBeat: (beat: CanvasScriptBeat) => void | Promise<void>;
    onExportBeats: (target: "video" | "comfyui" | "image", beatIds: string[]) => void;
    onStitchFrames: () => void;
    priceEstimates: { image: number | null; video: number | null };
    outputStates: Record<string, ScriptOutputState>;
    referenceOptions: ScriptReferenceOption[];
}) {
    const body = node.metadata?.scriptBody ?? node.metadata?.content ?? "";
    const beats = node.metadata?.scriptBeats?.length ? node.metadata.scriptBeats : buildScriptBeats(body);
    const acts = node.metadata?.scriptActs ?? [];
    const assets = node.metadata?.scriptAssets ?? [];
    const fieldStyle = { background: theme.node.fill, borderColor: theme.toolbar.border, color: theme.node.text };
    const [expandedBeatId, setExpandedBeatId] = useState<string | null>(null);
    const [actTitleDrafts, setActTitleDrafts] = useState<Record<string, string>>({});
    const [synthPendingId, setSynthPendingId] = useState<string | null>(null);
    const [exportPlan, setExportPlan] = useState<{ target: "video" | "comfyui" | "image"; selectedIds: string[] } | null>(null);
    const [newAsset, setNewAsset] = useState<{ kind: CanvasScriptAsset["kind"]; name: string }>({ kind: "character", name: "" });
    const updateBody = (scriptBody: string) => onChange({ scriptBody, content: scriptBody, status: scriptBody.trim() ? "success" : "idle" });
    // 正文含明确镜行编号（SH/SC/镜 N）时可本地重拆，不消耗模型
    const canReparse = /(^|\n)\s*(SH|SC|镜)\s*\d+/i.test(body);

    // 按幕分组：有幕信息时先显示幕标题，再渲染该幕的分镜；无幕信息时全部归入「未分幕」。
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
    const assetLabel = (kind: CanvasScriptAsset["kind"]) => (kind === "character" ? "人物" : kind === "scene" ? "场景" : "道具");
    const assetOptions = (kind: CanvasScriptAsset["kind"]) => assets.filter((asset) => asset.kind === kind && asset.name.trim()).map((asset) => ({ value: asset.name }));
    const actSelectOptions = useMemo(() => {
        const options = [{ value: ACT_UNASSIGNED, label: "未分幕" }, ...acts.map((act) => ({ value: act.title, label: act.title }))];
        const known = new Set(options.map((option) => option.value));
        beats.forEach((beat) => {
            const title = beat.act?.trim();
            if (title && !known.has(title)) {
                known.add(title);
                options.push({ value: title, label: title });
            }
        });
        return options;
    }, [acts, beats]);
    const referenceOptionById = useMemo(() => new Map(referenceOptions.map((option) => [option.id, option])), [referenceOptions]);
    const isReferenceOption = (id: string) => referenceOptionById.has(id);
    // 资产缺失检测：有输出映射且输出节点是可用图片（有内容）才算已有设定图
    const missingAssetCount = useMemo(() => {
        const outputs = node.metadata?.scriptAssetOutputs ?? {};
        return assets.filter((asset) => {
            const outId = outputs[asset.id];
            return !outId || !referenceOptionById.has(outId);
        }).length;
    }, [assets, node.metadata?.scriptAssetOutputs, referenceOptionById]);

    const addAct = () => {
        onChange({ scriptActs: [...acts, { id: `act-${Date.now()}`, title: `第${acts.length + 1}幕` }] });
    };
    const removeAct = (act: CanvasScriptAct) => {
        onChange({
            scriptActs: acts.filter((item) => item.id !== act.id),
            scriptBeats: beats.map((beat) => (beat.act === act.title ? { ...beat, act: undefined } : beat)),
        });
    };
    const renameAct = (act: CanvasScriptAct, nextTitleRaw: string) => {
        const nextTitle = nextTitleRaw.trim();
        setActTitleDrafts((current) => {
            const next = { ...current };
            delete next[act.id];
            return next;
        });
        if (!nextTitle || nextTitle === act.title) return;
        onChange({
            scriptActs: acts.map((item) => (item.id === act.id ? { ...item, title: nextTitle } : item)),
            scriptBeats: beats.map((beat) => (beat.act === act.title ? { ...beat, act: nextTitle } : beat)),
        });
    };
    const patchBeat = (beat: CanvasScriptBeat, patch: Partial<CanvasScriptBeat>) => onBeatChange({ ...beat, ...patch });

    const renderBeatCard = (beat: CanvasScriptBeat, index: number) => {
        const state = outputStates[beat.id] || "idle";
        const status = SCRIPT_OUTPUT_STATUS[state];
        const expanded = expandedBeatId === beat.id;
        const assetOutputs = node.metadata?.scriptAssetOutputs ?? {};
        const beatRefIds = resolveScriptBeatReferenceIds(beat, assets, assetOutputs, isReferenceOption);
        const beatRefsAuto = beat.referenceNodeIds === undefined && beatRefIds.length > 0;
        const setBeatRefs = (ids: string[]) => patchBeat(beat, { referenceNodeIds: ids });
        const assetRefCandidates = resolveScriptBeatReferenceIds({ character: beat.character, scene: beat.scene }, assets, assetOutputs, isReferenceOption).filter((id) => !beatRefIds.includes(id));
        const frameNodeId = node.metadata?.scriptBeatFrames?.[beat.id];
        const frameOption = frameNodeId ? referenceOptionById.get(frameNodeId) : undefined;
        const frameState = outputStates[`${beat.id}:frame`] || "idle";
        const frameStatus = SCRIPT_OUTPUT_STATUS[frameState];
        const autoImagePrompt = resolveScriptBeatImagePrompt({ ...beat, imagePrompt: undefined }, assets);
        const autoVideoPrompt = resolveScriptBeatVideoPrompt({ ...beat, videoPrompt: undefined });
        const colorMark = COLOR_MARKS.find((mark) => mark.value === beat.colorMark);
        return (
            <div key={beat.id} className="rounded-xl border" style={{ borderColor: theme.toolbar.border, background: theme.node.fill, ...(colorMark ? { borderLeft: `3px solid ${colorMark.color}` } : {}) }}>
                <div className="flex items-center gap-2 px-3 pt-2.5">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold" style={{ background: theme.ui.controlFill, color: theme.node.muted }}>
                        {index + 1}
                    </span>
                    <input
                        className="h-7 min-w-0 flex-1 rounded bg-transparent px-1 text-[13px] font-medium outline-none placeholder:opacity-35"
                        value={beat.title}
                        placeholder="分镜标题"
                        onChange={(event) => patchBeat(beat, { title: event.target.value })}
                    />
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px]" style={statusTagStyle(status.color)}>
                        {status.label}
                    </span>
                    {beat.shotType ? <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] opacity-70" style={{ background: theme.ui.controlFill }}>{beat.shotType}</span> : null}
                    {beat.duration ? <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] opacity-70" style={{ background: theme.ui.controlFill }}>{beat.duration}</span> : null}
                    {beatRefIds.length ? (
                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] opacity-70" style={{ background: theme.ui.controlFill }}>
                            垫图 {beatRefIds.length}
                        </span>
                    ) : null}
                    {frameNodeId ? (
                        <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px]" style={statusTagStyle(frameStatus.color)} title={`分镜帧：${frameStatus.label}${frameOption ? `（${frameOption.title}）` : ""}`}>
                            帧图·{frameStatus.label}
                        </span>
                    ) : null}
                    <Dropdown
                        menu={{
                            items: [
                                { key: "image", label: "分镜图节点", icon: <ImageIcon className="size-3.5" /> },
                                { key: "video", label: "视频节点", icon: <Clapperboard className="size-3.5" /> },
                                { key: "comfyui", label: "ComfyUI 节点", icon: <Workflow className="size-3.5" /> },
                            ],
                            onClick: ({ key }) => onGenerateBeat(beat, index, key as "video" | "comfyui" | "image"),
                        }}
                        disabled={!beat.content.trim() && !beat.title.trim()}
                    >
                        <Button size="small" type="primary" ghost>
                            生成
                        </Button>
                    </Dropdown>
                    <button
                        type="button"
                        className="shrink-0 opacity-55 transition hover:opacity-100"
                        onClick={() => setExpandedBeatId(expanded ? null : beat.id)}
                        aria-label={expanded ? "收起分镜" : "展开分镜"}
                    >
                        {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </button>
                </div>
                {beat.content ? <div className="mt-1 line-clamp-2 px-3 text-xs leading-5 opacity-60">{beat.content}</div> : null}
                {beat.dialogue ? <div className="mt-0.5 truncate px-3 text-[11px] opacity-50">台词：{beat.dialogue}</div> : null}
                <div className="mt-1.5 flex items-center gap-3 px-3 pb-2 text-[11px]">
                    <button type="button" className="opacity-45 transition hover:opacity-100 disabled:opacity-20" disabled={index === 0} onClick={() => onBeatMove(index, -1)}>
                        上移
                    </button>
                    <button type="button" className="opacity-45 transition hover:opacity-100 disabled:opacity-20" disabled={index === beats.length - 1} onClick={() => onBeatMove(index, 1)}>
                        下移
                    </button>
                    <button type="button" className="opacity-45 transition hover:opacity-100" onClick={() => onBeatAdd(index, beat.act)}>
                        在下方插入
                    </button>
                    <Dropdown
                        menu={{
                            items: [{ key: "none", label: "无标记" }, ...COLOR_MARKS.map((mark) => ({ key: mark.value, label: `${mark.label}色标记` }))],
                            selectedKeys: beat.colorMark ? [beat.colorMark] : ["none"],
                            onClick: ({ key }) => patchBeat(beat, { colorMark: key === "none" ? undefined : (key as NonNullable<CanvasScriptBeat["colorMark"]>) }),
                        }}
                    >
                        <button type="button" className="opacity-45 transition hover:opacity-100">
                            标记
                        </button>
                    </Dropdown>
                    <Popconfirm title="删除该分镜？" description="其帧图与输出节点的关联将解除，画布上已生成的节点保留。" okText="删除" cancelText="取消" onConfirm={() => onBeatRemove(index)}>
                        <button type="button" className="opacity-45 transition hover:opacity-100">
                            删除
                        </button>
                    </Popconfirm>
                    {beat.camera ? <span className="ml-auto truncate opacity-40">{beat.camera}</span> : null}
                </div>
                {expanded ? (
                    <div className="space-y-2 border-t px-3 py-2.5" style={{ borderColor: theme.toolbar.border }}>
                        <textarea
                            className="thin-scrollbar h-20 w-full resize-none rounded-lg border px-2.5 py-1.5 text-xs leading-5 outline-none placeholder:opacity-35"
                            value={beat.content}
                            placeholder="画面描述：主体、动作、环境、氛围"
                            onChange={(event) => patchBeat(beat, { content: event.target.value })}
                            style={fieldStyle}
                        />
                        <textarea
                            className="thin-scrollbar h-14 w-full resize-none rounded-lg border px-2.5 py-1.5 text-xs leading-5 outline-none placeholder:opacity-35"
                            value={beat.imagePrompt || ""}
                            placeholder={`分镜图提示词（留空自动合成）：${autoImagePrompt}`}
                            onChange={(event) => patchBeat(beat, { imagePrompt: event.target.value || undefined })}
                            style={fieldStyle}
                            aria-label="分镜图提示词"
                        />
                        <textarea
                            className="thin-scrollbar h-14 w-full resize-none rounded-lg border px-2.5 py-1.5 text-xs leading-5 outline-none placeholder:opacity-35"
                            value={beat.videoPrompt || ""}
                            placeholder={`视频运动提示词（留空自动拼接）：${autoVideoPrompt}`}
                            onChange={(event) => patchBeat(beat, { videoPrompt: event.target.value || undefined })}
                            style={fieldStyle}
                            aria-label="视频运动提示词"
                        />
                        <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate text-[11px] opacity-40">运动提示词按 起始状态 → 按秒动作 → 结束状态 → 音效/配乐 结构撰写</span>
                            <Button
                                size="small"
                                icon={<Sparkles className="size-3.5" />}
                                loading={synthPendingId === beat.id}
                                disabled={!beat.content.trim() && !beat.title.trim()}
                                onClick={async () => {
                                    setSynthPendingId(beat.id);
                                    try {
                                        await onSynthesizeBeat(beat);
                                    } finally {
                                        setSynthPendingId(null);
                                    }
                                }}
                            >
                                智能合成提示词
                            </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <input
                                className="h-8 w-full rounded-lg border px-2.5 text-xs outline-none placeholder:opacity-35"
                                value={beat.dialogue || ""}
                                placeholder="台词 / 旁白（无则留空）"
                                onChange={(event) => patchBeat(beat, { dialogue: event.target.value })}
                                style={fieldStyle}
                            />
                            <input
                                className="h-8 w-full rounded-lg border px-2.5 text-xs outline-none placeholder:opacity-35"
                                value={beat.soundEffect || ""}
                                placeholder="音效 / 配乐（如 风声、鼓点）"
                                onChange={(event) => patchBeat(beat, { soundEffect: event.target.value })}
                                style={fieldStyle}
                            />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <AutoComplete size="small" value={beat.shotType || ""} options={SHOT_TYPE_OPTIONS} placeholder="景别（如 特写）" onChange={(value) => patchBeat(beat, { shotType: value })} />
                            <AutoComplete size="small" value={beat.duration || ""} options={DURATION_OPTIONS} placeholder="时长（如 5s）" onChange={(value) => patchBeat(beat, { duration: value })} />
                            <AutoComplete size="small" value={beat.camera || ""} options={CAMERA_OPTIONS} placeholder="机位 / 运镜" onChange={(value) => patchBeat(beat, { camera: value })} />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                            <AutoComplete size="small" value={beat.character || ""} options={assetOptions("character")} placeholder="角色（引用人物资产）" onChange={(value) => patchBeat(beat, { character: value })} />
                            <AutoComplete size="small" value={beat.scene || ""} options={assetOptions("scene")} placeholder="场景（引用场景资产）" onChange={(value) => patchBeat(beat, { scene: value })} />
                            <Select
                                size="small"
                                value={beat.act?.trim() ? beat.act.trim() : ACT_UNASSIGNED}
                                options={actSelectOptions}
                                onChange={(value) => patchBeat(beat, { act: value === ACT_UNASSIGNED ? undefined : value })}
                            />
                        </div>
                        <div>
                            <div className="mb-1 flex items-center gap-2 text-[11px] opacity-55">
                                <span>参考垫图（生成时作为参考图带入，确认卡片里可再调整）</span>
                                {beatRefsAuto ? <span className="opacity-70">已按角色/场景自动带入</span> : null}
                                {frameNodeId ? <span className="opacity-70">视频生成自动携带分镜帧作首帧</span> : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5">
                                {beatRefIds.map((id) => {
                                    const option = referenceOptionById.get(id);
                                    return (
                                        <span key={id} className="relative block size-10 shrink-0" title={option?.title || "参考图"}>
                                            <span className="block size-10 overflow-hidden rounded-md border" style={{ borderColor: theme.toolbar.border, background: theme.ui.controlFill }}>
                                                {option?.url ? (
                                                    <img src={option.url} alt={option.title} className="size-full object-cover" />
                                                ) : (
                                                    <span className="grid size-full place-items-center opacity-50">
                                                        <ImageIcon className="size-4" />
                                                    </span>
                                                )}
                                            </span>
                                            <button type="button" aria-label={`移除参考图 ${option?.title || ""}`} className="absolute right-0 top-0 grid size-7 place-items-center" onClick={() => setBeatRefs(beatRefIds.filter((item) => item !== id))}>
                                                <span className="grid size-4 place-items-center rounded-full bg-black/70 text-white transition hover:bg-red-500/90">
                                                    <X className="size-2.5" />
                                                </span>
                                            </button>
                                        </span>
                                    );
                                })}
                                <Select
                                    size="small"
                                    style={{ minWidth: 132 }}
                                    placeholder="添加参考图"
                                    value={null}
                                    showSearch
                                    options={referenceOptions.filter((option) => !beatRefIds.includes(option.id)).map((option) => ({ value: option.id, label: option.title }))}
                                    onChange={(id) => {
                                        if (id) setBeatRefs([...beatRefIds, id]);
                                    }}
                                />
                                {assetRefCandidates.length ? (
                                    <button type="button" className="rounded border px-2 py-1 text-[11px] opacity-60 transition hover:opacity-100" style={{ borderColor: theme.toolbar.border }} onClick={() => setBeatRefs([...beatRefIds, ...assetRefCandidates])}>
                                        带入角色/场景设定图
                                    </button>
                                ) : null}
                                {!beatRefIds.length && !assetRefCandidates.length ? <span className="text-[11px] opacity-40">无垫图时按文生视频生成</span> : null}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    };

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
                                { key: "image", label: "导出为分镜图节点", icon: <ImageIcon className="size-3.5" /> },
                                { key: "video", label: "导出为视频节点", icon: <Clapperboard className="size-3.5" /> },
                                { key: "comfyui", label: "导出为 ComfyUI 节点", icon: <Workflow className="size-3.5" /> },
                                { type: "divider" as const },
                                { key: "stitch", label: "拼接导出分镜图整图", icon: <Download className="size-3.5" /> },
                            ],
                            onClick: ({ key }) => {
                                if (key === "stitch") {
                                    onStitchFrames();
                                    return;
                                }
                                setExportPlan({ target: key as "video" | "comfyui" | "image", selectedIds: beats.map((beat) => beat.id) });
                            },
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
                    <label className="nodrag nopan flex min-h-0 flex-1 flex-col" onMouseDownCapture={stopCanvasPanelInteraction} onPointerDownCapture={stopCanvasPanelInteraction} onClickCapture={(event) => event.stopPropagation()}>
                        <span className="mb-1 block text-xs opacity-55">剧本正文</span>
                        <textarea className="thin-scrollbar min-h-40 w-full flex-1 resize-none rounded-lg border px-3 py-2 text-sm leading-6 outline-none placeholder:opacity-35" value={body} placeholder="按幕、段落或镜头写下脚本内容" onChange={(event) => updateBody(event.target.value)} style={fieldStyle} />
                    </label>
                    <div className="text-[11px] leading-5 opacity-45">连接上游文本节点可自动读取剧本；AI 拆解按「人物 → 道具 → 场景」提取资产后再拆分镜。</div>

                    <div className="mt-1">
                        <div className="mb-2 flex items-center justify-between">
                            <div className="text-xs font-medium opacity-65">资产（人物 / 道具 / 场景）</div>
                            <div className="text-[11px] opacity-45">{assets.length} 项</div>
                        </div>
                        {missingAssetCount ? (
                            <div className="mb-2 flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-[11px]" style={{ borderColor: theme.toolbar.border, background: theme.ui.controlFill }}>
                                <span className="opacity-70">检测到 {missingAssetCount} 个资产还没有设定图</span>
                                <button type="button" className="opacity-70 transition hover:opacity-100" onClick={onGenerateAllAssets}>
                                    一键补齐
                                </button>
                            </div>
                        ) : null}
                        <div className="thin-scrollbar max-h-72 space-y-2 overflow-y-auto pr-1">
                            {assets.map((asset) => {
                                const state = outputStates[asset.id] || "idle";
                                const status = SCRIPT_OUTPUT_STATUS[state];
                                return (
                                    <div key={asset.id} className="rounded-xl border p-2.5" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                                        <div className="flex items-center gap-2">
                                            <span className="w-12 shrink-0 rounded px-1.5 py-0.5 text-center text-[10px]" style={{ background: theme.node.fill }}>
                                                {assetLabel(asset.kind)}
                                            </span>
                                            <input className="h-7 w-28 min-w-0 rounded border px-2 text-xs outline-none" value={asset.name} placeholder="名称" onChange={(event) => onAssetChange({ ...asset, name: event.target.value })} style={fieldStyle} />
                                            <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px]" style={statusTagStyle(status.color)}>
                                                {status.label}
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
                        <div className="text-sm font-medium opacity-70">分镜</div>
                        <div className="flex items-center gap-3">
                            <div className="text-xs opacity-45">{acts.length} 幕 · {beats.length} 个分镜 · 逐镜「生成」创建节点后在确认卡片提交，或顶部「导出」批量创建</div>
                            <Button size="small" icon={<Plus className="size-3.5" />} onClick={addAct}>
                                新增幕
                            </Button>
                        </div>
                    </div>
                    <div className="thin-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                        {actGroups.map((group) => (
                            <div key={group.actTitle} className="space-y-2">
                                <div className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: theme.toolbar.border, background: theme.ui.controlFill }}>
                                    {group.act ? (
                                        <input
                                            className="h-7 min-w-0 flex-1 rounded bg-transparent px-1 text-[13px] font-semibold outline-none"
                                            value={actTitleDrafts[group.act.id] ?? group.act.title}
                                            onChange={(event) => setActTitleDrafts((current) => ({ ...current, [group.act!.id]: event.target.value }))}
                                            onBlur={(event) => renameAct(group.act!, event.target.value)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                                            }}
                                            aria-label="幕标题"
                                        />
                                    ) : (
                                        <span className="min-w-0 flex-1 px-1 text-[13px] font-semibold opacity-80">{group.actTitle}</span>
                                    )}
                                    {group.act?.duration ? <span className="shrink-0 text-[11px] opacity-45">{group.act.duration}</span> : null}
                                    <span className="shrink-0 text-[11px] opacity-45">{group.beats.length} 镜</span>
                                    <button type="button" className="shrink-0 text-[11px] opacity-50 transition hover:opacity-100" onClick={() => onBeatAdd(group.beats.length ? group.beats[group.beats.length - 1].index : beats.length - 1, group.act?.title)}>
                                        ＋ 分镜
                                    </button>
                                    {group.act ? (
                                        <button type="button" className="shrink-0 text-[11px] opacity-50 transition hover:opacity-100" onClick={() => removeAct(group.act!)}>
                                            删除幕
                                        </button>
                                    ) : null}
                                </div>
                                {group.act?.summary ? <div className="px-3 text-[11px] leading-4 opacity-45">{group.act.summary}</div> : null}
                                {group.beats.map(({ beat, index }, groupIndex) => {
                                    const showSceneHeading = Boolean(beat.sceneHeading) && beat.sceneHeading !== group.beats[groupIndex - 1]?.beat.sceneHeading;
                                    return (
                                        <div key={beat.id} className="space-y-2">
                                            {showSceneHeading ? <div className="px-3 pt-1 text-[11px] opacity-50">{beat.sceneHeading}</div> : null}
                                            {renderBeatCard(beat, index)}
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                        {!beats.length ? <div className="rounded-xl border border-dashed px-4 py-8 text-center text-xs opacity-45" style={{ borderColor: theme.toolbar.border }}>还没有分镜。先写剧本，再点顶部「AI 拆解」，或手动新增分镜。</div> : null}
                    </div>
                    <div className="mt-2">
                        <Button size="small" block icon={<Plus className="size-3.5" />} onClick={() => onBeatAdd(beats.length - 1)}>
                            新增分镜
                        </Button>
                    </div>
                </div>
            </div>
            <Modal
                open={Boolean(exportPlan)}
                title={exportPlan?.target === "image" ? "批量导出分镜图节点" : exportPlan?.target === "video" ? "批量导出视频节点" : "批量导出 ComfyUI 节点"}
                onCancel={() => setExportPlan(null)}
                okText={exportPlan ? `确认导出（${exportPlan.selectedIds.length}）` : "确认导出"}
                okButtonProps={{ disabled: !exportPlan?.selectedIds.length }}
                onOk={() => {
                    if (!exportPlan) return;
                    onExportBeats(exportPlan.target, exportPlan.selectedIds);
                    setExportPlan(null);
                }}
            >
                {exportPlan ? (
                    <div className="space-y-2">
                        <div className="text-xs opacity-55">勾选要导出的分镜；导出只创建节点，生成仍需在确认卡片中提交。帧图/垫图状态供参考，缺失可之后补齐。</div>
                        <div className="thin-scrollbar max-h-72 space-y-1 overflow-y-auto pr-1">
                            {beats.map((beat, index) => {
                                const checked = exportPlan.selectedIds.includes(beat.id);
                                const frameId = node.metadata?.scriptBeatFrames?.[beat.id];
                                const frameReady = Boolean(frameId && referenceOptionById.has(frameId));
                                const refCount = resolveScriptBeatReferenceIds(beat, assets, node.metadata?.scriptAssetOutputs ?? {}, (id) => referenceOptionById.has(id)).length;
                                const promptsReady = Boolean(beat.imagePrompt || beat.videoPrompt);
                                return (
                                    <label key={beat.id} className="flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                                        <Checkbox
                                            checked={checked}
                                            onChange={(event) =>
                                                setExportPlan((current) =>
                                                    current ? { ...current, selectedIds: event.target.checked ? [...current.selectedIds, beat.id] : current.selectedIds.filter((id) => id !== beat.id) } : current,
                                                )
                                            }
                                        />
                                        <span className="w-10 shrink-0 opacity-50">镜 {index + 1}</span>
                                        <span className="min-w-0 flex-1 truncate">{beat.title}</span>
                                        <span className="shrink-0 opacity-55">
                                            {frameReady ? "帧图✓" : "无帧图"} · 垫图{refCount}
                                            {promptsReady ? " · 提示词✓" : ""}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                        <div className="text-[11px] opacity-50">
                            {exportPlan.target === "comfyui"
                                ? "ComfyUI 使用你自己的工作流与算力，不消耗平台积分。"
                                : (() => {
                                      const unit = exportPlan.target === "image" ? priceEstimates.image : priceEstimates.video;
                                      return unit != null
                                          ? `预计消耗约 ${(unit * exportPlan.selectedIds.length).toFixed(2)} 积分（${unit} 积分/镜，按当前模型与参数估算，实际以服务端扣费为准）`
                                          : "当前模型未配置积分单价或为免费模型，实际扣费以服务端为准。";
                                  })()}
                        </div>
                    </div>
                ) : null}
            </Modal>
        </div>
    );
}
