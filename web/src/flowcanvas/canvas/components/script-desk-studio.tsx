import { useMemo, useState } from "react";
import { AutoComplete, Button, Checkbox, Dropdown, Modal, Popconfirm, Select } from "antd";
import { Check, ChevronDown, ChevronRight, Clapperboard, Download, Image as ImageIcon, ListOrdered, Plus, Sparkles, Upload, Workflow, X } from "lucide-react";

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

type ExportTarget = "video" | "comfyui" | "image";

// 分镜表格列：镜号标题 / 画面描述 / 景别 / 时长 / 光影氛围 / 对白·旁白 / 音效 / 运镜 / 生成 / 操作
const BEAT_GRID = "grid-cols-[150px_minmax(220px,1fr)_96px_76px_130px_150px_110px_110px_170px_150px]";

/**
 * 脚本节点全屏工作台（对齐 LibTV 脚本生成器的三步引导流水线）：
 * 1 确认镜头（分镜表格）→ 2 准备资产（角色/场景/道具三区 + 缺失一键补齐）→ 3 合成提示词（双轨 + 智能合成），
 * 全部就绪后批量导出；逐镜生成始终打开 composer 确认卡片，不直接扣费。
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
    onGenerateBeat: (beat: CanvasScriptBeat, index: number, target: ExportTarget) => void;
    onGenerateAsset: (asset: CanvasScriptAsset, target: "image" | "comfyui") => void;
    onGenerateAllAssets: () => void;
    onSynthesizeBeat: (beat: CanvasScriptBeat) => void | Promise<void>;
    onExportBeats: (target: ExportTarget, beatIds: string[]) => void;
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
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [expandedBeatId, setExpandedBeatId] = useState<string | null>(null);
    const [actTitleDrafts, setActTitleDrafts] = useState<Record<string, string>>({});
    const [synthPendingId, setSynthPendingId] = useState<string | null>(null);
    const [synthAllPending, setSynthAllPending] = useState(false);
    const [promptBeatId, setPromptBeatId] = useState<string | null>(null);
    const [exportPlan, setExportPlan] = useState<{ target: ExportTarget; selectedIds: string[] } | null>(null);
    const [gateInfo, setGateInfo] = useState<{ target: ExportTarget; reasons: string[] } | null>(null);
    const [newAsset, setNewAsset] = useState<{ kind: CanvasScriptAsset["kind"]; name: string }>({ kind: "character", name: "" });
    const updateBody = (scriptBody: string) => onChange({ scriptBody, content: scriptBody, status: scriptBody.trim() ? "success" : "idle" });
    // 正文含明确镜行编号（SH/SC/镜 N）时可本地重拆，不消耗模型
    const canReparse = /(^|\n)\s*(SH|SC|镜)\s*\d+/i.test(body);

    // 按幕分组：有幕信息时先显示幕标题，再渲染该幕的分镜；无幕信息时全部归入「未分幕」。
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
            groups.push({ actTitle: actTitle || "未分幕", act: findAct(actTitle), beats: buckets.get(actTitle) || [] });
        });
        return groups;
    }, [acts, beats]);
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
    const synthesizedCount = useMemo(() => beats.filter((beat) => beat.imagePrompt && beat.videoPrompt).length, [beats]);
    const frameReadyCount = useMemo(() => beats.filter((beat) => { const id = node.metadata?.scriptBeatFrames?.[beat.id]; return id && referenceOptionById.has(id); }).length, [beats, node.metadata?.scriptBeatFrames, referenceOptionById]);

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

    const synthesizeBeat = async (beat: CanvasScriptBeat) => {
        setSynthPendingId(beat.id);
        try {
            await onSynthesizeBeat(beat);
        } finally {
            setSynthPendingId(null);
        }
    };
    const synthesizeAll = async () => {
        setSynthAllPending(true);
        try {
            for (const beat of beats) {
                if (!beat.imagePrompt || !beat.videoPrompt) await onSynthesizeBeat(beat);
            }
        } finally {
            setSynthAllPending(false);
        }
    };

    // 批量导出门槛：资产设定图与双轨提示词未就绪时先给清单原因，可选择跳转补齐或仍然导出
    const openExport = (target: ExportTarget) => {
        if (target === "comfyui") {
            setExportPlan({ target, selectedIds: beats.map((beat) => beat.id) });
            return;
        }
        const reasons: string[] = [];
        if (missingAssetCount) reasons.push(`${missingAssetCount} 个资产还没有设定图（步骤 2 可一键补齐）`);
        const unsynthesized = beats.length - synthesizedCount;
        if (unsynthesized) reasons.push(`${unsynthesized} 个分镜还没有合成双轨提示词（步骤 3 可一键合成，留空则导出时自动拼接）`);
        if (reasons.length) setGateInfo({ target, reasons });
        else setExportPlan({ target, selectedIds: beats.map((beat) => beat.id) });
    };

    const promptBeat = promptBeatId ? beats.find((beat) => beat.id === promptBeatId) || null : null;

    const steps = [
        { index: 1 as const, label: "确认镜头", count: `${beats.length} 镜` },
        { index: 2 as const, label: "准备资产", count: assets.length ? `${assets.length - missingAssetCount}/${assets.length}` : "0 项" },
        { index: 3 as const, label: "合成提示词", count: `${synthesizedCount}/${beats.length}` },
    ];

    /** 分镜行的帧图/垫图状态 chips + 生成入口（步骤 1 表格与步骤 3 共用） */
    const renderBeatGenerate = (beat: CanvasScriptBeat, index: number) => {
        const frameNodeId = node.metadata?.scriptBeatFrames?.[beat.id];
        const frameState = outputStates[`${beat.id}:frame`] || "idle";
        const frameStatus = SCRIPT_OUTPUT_STATUS[frameState];
        const refCount = resolveScriptBeatReferenceIds(beat, assets, node.metadata?.scriptAssetOutputs ?? {}, isReferenceOption).length;
        return (
            <div className="flex items-center gap-1.5">
                {frameNodeId ? (
                    <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px]" style={statusTagStyle(frameStatus.color)} title={`分镜帧：${frameStatus.label}`}>
                        帧图·{frameStatus.label}
                    </span>
                ) : null}
                {refCount ? <span className="shrink-0 rounded px-1.5 py-0.5 text-[11px] opacity-70" style={{ background: theme.ui.controlFill }}>垫图{refCount}</span> : null}
                <Dropdown
                    menu={{
                        items: [
                            { key: "image", label: "分镜图节点", icon: <ImageIcon className="size-3.5" /> },
                            { key: "video", label: "视频节点", icon: <Clapperboard className="size-3.5" /> },
                            { key: "comfyui", label: "ComfyUI 节点", icon: <Workflow className="size-3.5" /> },
                        ],
                        onClick: ({ key }) => onGenerateBeat(beat, index, key as ExportTarget),
                    }}
                    disabled={!beat.content.trim() && !beat.title.trim()}
                >
                    <Button size="small" type="primary" ghost>
                        生成
                    </Button>
                </Dropdown>
            </div>
        );
    };

    /** 步骤 1 的分镜表格行 */
    const renderBeatRow = (beat: CanvasScriptBeat, index: number) => {
        const state = outputStates[beat.id] || "idle";
        const status = SCRIPT_OUTPUT_STATUS[state];
        const expanded = expandedBeatId === beat.id;
        const colorMark = COLOR_MARKS.find((mark) => mark.value === beat.colorMark);
        const beatRefIds = resolveScriptBeatReferenceIds(beat, assets, node.metadata?.scriptAssetOutputs ?? {}, isReferenceOption);
        const beatRefsAuto = beat.referenceNodeIds === undefined && beatRefIds.length > 0;
        const setBeatRefs = (ids: string[]) => patchBeat(beat, { referenceNodeIds: ids });
        const assetRefCandidates = resolveScriptBeatReferenceIds({ character: beat.character, scene: beat.scene }, assets, node.metadata?.scriptAssetOutputs ?? {}, isReferenceOption).filter((id) => !beatRefIds.includes(id));
        const frameNodeId = node.metadata?.scriptBeatFrames?.[beat.id];
        return (
            <div key={beat.id} className="border-b" style={{ borderColor: theme.toolbar.border, background: theme.node.fill, ...(colorMark ? { borderLeft: `3px solid ${colorMark.color}` } : {}) }}>
                <div className={`grid ${BEAT_GRID} items-center gap-2 px-2 py-1.5`}>
                    <div className="flex min-w-0 items-center gap-1.5">
                        <span className="flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold" style={{ background: theme.ui.controlFill, color: theme.node.muted }}>
                            {index + 1}
                        </span>
                        <input className="h-7 min-w-0 flex-1 rounded bg-transparent px-1 text-xs font-medium outline-none placeholder:opacity-35" value={beat.title} placeholder="分镜标题" onChange={(event) => patchBeat(beat, { title: event.target.value })} />
                    </div>
                    <textarea className="thin-scrollbar h-8 w-full resize-none rounded border px-2 py-1.5 text-xs leading-5 outline-none placeholder:opacity-35" value={beat.content} placeholder="画面描述：主体、动作、环境、氛围" onChange={(event) => patchBeat(beat, { content: event.target.value })} style={fieldStyle} />
                    <AutoComplete size="small" value={beat.shotType || ""} options={SHOT_TYPE_OPTIONS} placeholder="景别" onChange={(value) => patchBeat(beat, { shotType: value })} />
                    <AutoComplete size="small" value={beat.duration || ""} options={DURATION_OPTIONS} placeholder="时长" onChange={(value) => patchBeat(beat, { duration: value })} />
                    <input className="h-8 w-full rounded border px-2 text-xs outline-none placeholder:opacity-35" value={beat.atmosphere || ""} placeholder="如 黄昏暖光" onChange={(event) => patchBeat(beat, { atmosphere: event.target.value })} style={fieldStyle} />
                    <input className="h-8 w-full rounded border px-2 text-xs outline-none placeholder:opacity-35" value={beat.dialogue || ""} placeholder="台词 / 旁白" onChange={(event) => patchBeat(beat, { dialogue: event.target.value })} style={fieldStyle} />
                    <input className="h-8 w-full rounded border px-2 text-xs outline-none placeholder:opacity-35" value={beat.soundEffect || ""} placeholder="如 风声、鼓点" onChange={(event) => patchBeat(beat, { soundEffect: event.target.value })} style={fieldStyle} />
                    <AutoComplete size="small" value={beat.camera || ""} options={CAMERA_OPTIONS} placeholder="机位 / 运镜" onChange={(value) => patchBeat(beat, { camera: value })} />
                    {renderBeatGenerate(beat, index)}
                    <div className="flex items-center gap-2 text-[11px]">
                        <span className="shrink-0 rounded-full px-1.5 py-0.5" style={statusTagStyle(status.color)} title={`视频输出：${status.label}`}>
                            {status.label}
                        </span>
                        <Dropdown
                            menu={{
                                items: [
                                    { key: "up", label: "上移", disabled: index === 0 },
                                    { key: "down", label: "下移", disabled: index === beats.length - 1 },
                                    { key: "insert", label: "在下方插入" },
                                    { type: "divider" as const },
                                    { key: "none", label: "无标记" },
                                    ...COLOR_MARKS.map((mark) => ({ key: `mark-${mark.value}`, label: `${mark.label}色标记` })),
                                ],
                                onClick: ({ key }) => {
                                    if (key === "up") onBeatMove(index, -1);
                                    else if (key === "down") onBeatMove(index, 1);
                                    else if (key === "insert") onBeatAdd(index, beat.act);
                                    else if (key === "none") patchBeat(beat, { colorMark: undefined });
                                    else if (key.startsWith("mark-")) patchBeat(beat, { colorMark: key.slice(5) as NonNullable<CanvasScriptBeat["colorMark"]> });
                                },
                            }}
                        >
                            <button type="button" className="shrink-0 opacity-45 transition hover:opacity-100">
                                操作
                            </button>
                        </Dropdown>
                        <Popconfirm title="删除该分镜？" description="其帧图与输出节点的关联将解除，画布上已生成的节点保留。" okText="删除" cancelText="取消" onConfirm={() => onBeatRemove(index)}>
                            <button type="button" className="shrink-0 opacity-45 transition hover:opacity-100">
                                删除
                            </button>
                        </Popconfirm>
                        <button type="button" className="shrink-0 opacity-55 transition hover:opacity-100" onClick={() => setExpandedBeatId(expanded ? null : beat.id)} aria-label={expanded ? "收起垫图与归属" : "展开垫图与归属"}>
                            {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        </button>
                    </div>
                </div>
                {expanded ? (
                    <div className="space-y-2 px-3 pb-2.5 pt-1">
                        <div className="grid max-w-xl grid-cols-3 gap-2">
                            <AutoComplete size="small" value={beat.character || ""} options={assetOptions("character")} placeholder="角色（引用人物资产）" onChange={(value) => patchBeat(beat, { character: value })} />
                            <AutoComplete size="small" value={beat.scene || ""} options={assetOptions("scene")} placeholder="场景（引用场景资产）" onChange={(value) => patchBeat(beat, { scene: value })} />
                            <Select size="small" value={beat.act?.trim() ? beat.act.trim() : ACT_UNASSIGNED} options={actSelectOptions} onChange={(value) => patchBeat(beat, { act: value === ACT_UNASSIGNED ? undefined : value })} />
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

    /** 步骤 2 的资产卡 */
    const renderAssetCard = (asset: CanvasScriptAsset) => {
        const state = outputStates[asset.id] || "idle";
        const status = SCRIPT_OUTPUT_STATUS[state];
        return (
            <div key={asset.id} className="rounded-xl border p-2.5" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                <div className="flex items-center gap-2">
                    <input className="h-7 min-w-0 flex-1 rounded border px-2 text-xs outline-none" value={asset.name} placeholder="名称" onChange={(event) => onAssetChange({ ...asset, name: event.target.value })} style={fieldStyle} />
                    <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px]" style={statusTagStyle(status.color)}>
                        {status.label}
                    </span>
                    <button type="button" className="shrink-0 text-xs opacity-50 transition hover:opacity-100" onClick={() => onAssetRemove(asset.id)}>
                        删除
                    </button>
                </div>
                <textarea className="thin-scrollbar mt-1.5 h-14 w-full resize-none rounded border px-2 py-1 text-xs leading-4 outline-none" value={asset.description} placeholder="外观/环境描述" onChange={(event) => onAssetChange({ ...asset, description: event.target.value })} style={fieldStyle} />
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
    };

    const assetZones: Array<{ kind: CanvasScriptAsset["kind"]; label: string }> = [
        { kind: "character", label: "角色" },
        { kind: "scene", label: "场景" },
        { kind: "prop", label: "道具" },
    ];

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
                                openExport(key as ExportTarget);
                            },
                        }}
                        disabled={!beats.length}
                    >
                        <Button icon={<Download className="size-4" />}>导出</Button>
                    </Dropdown>
                    <Button type="text" shape="circle" icon={<X className="size-4" />} onClick={onClose} aria-label="关闭脚本工作台" />
                </div>
            </div>

            {/* 三步进度条（对齐 LibTV 脚本生成器） */}
            <div className="flex shrink-0 items-center gap-2 border-b px-5 py-2" style={{ borderColor: theme.toolbar.border }}>
                {steps.map((item, order) => {
                    const active = step === item.index;
                    const done = item.index === 1 ? beats.length > 0 : item.index === 2 ? assets.length > 0 && missingAssetCount === 0 : synthesizedCount === beats.length && beats.length > 0;
                    return (
                        <div key={item.index} className="flex items-center gap-2">
                            {order > 0 ? <ChevronRight className="size-3.5 opacity-30" /> : null}
                            <button
                                type="button"
                                onClick={() => setStep(item.index)}
                                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs transition"
                                style={active ? { background: theme.ui.accentSoft, color: theme.ui.accent } : { color: theme.node.muted }}
                            >
                                <span className="grid size-4 place-items-center rounded-full text-[10px] font-semibold" style={done ? { background: "#22c55e", color: "#fff" } : { background: theme.ui.controlFill }}>
                                    {done ? <Check className="size-3" /> : item.index}
                                </span>
                                <span className="font-medium">{item.label}</span>
                                <span className="opacity-60">{item.count}</span>
                            </button>
                        </div>
                    );
                })}
                <span className="ml-auto text-[11px] opacity-40">三步就绪后可批量导出；逐镜生成始终在确认卡片提交后才扣费</span>
            </div>

            {step === 1 ? (
                <div className="grid min-h-0 flex-1 grid-cols-[360px_1fr] gap-0">
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
                    </div>

                    <div className="flex min-h-0 flex-col p-4">
                        <div className="mb-2 flex items-center justify-between">
                            <div className="text-sm font-medium opacity-70">分镜表</div>
                            <div className="flex items-center gap-2">
                                <span className="text-xs opacity-45">{acts.length} 幕 · {beats.length} 镜 · 帧图 {frameReadyCount}</span>
                                <Button size="small" icon={<Plus className="size-3.5" />} onClick={addAct}>
                                    新增幕
                                </Button>
                                <Button size="small" icon={<Plus className="size-3.5" />} onClick={() => onBeatAdd(beats.length - 1)}>
                                    新增分镜
                                </Button>
                            </div>
                        </div>
                        <div className="thin-scrollbar min-h-0 flex-1 overflow-auto rounded-xl border" style={{ borderColor: theme.toolbar.border }}>
                            <div className="min-w-[1420px]">
                                <div className={`grid ${BEAT_GRID} gap-2 border-b px-2 py-2 text-[11px] opacity-55`} style={{ borderColor: theme.toolbar.border, background: theme.ui.controlFill }}>
                                    <span>镜号 / 标题</span>
                                    <span>画面描述</span>
                                    <span>景别</span>
                                    <span>时长</span>
                                    <span>光影氛围</span>
                                    <span>对白·旁白</span>
                                    <span>音效</span>
                                    <span>运镜</span>
                                    <span>生成</span>
                                    <span>状态 / 操作</span>
                                </div>
                                {actGroups.map((group) => (
                                    <div key={group.actTitle}>
                                        {acts.length || group.actTitle !== "未分幕" ? (
                                            <div className="flex items-center gap-2 border-b px-3 py-1.5" style={{ borderColor: theme.toolbar.border, background: theme.ui.controlFill }}>
                                                {group.act ? (
                                                    <input
                                                        className="h-6 min-w-0 flex-1 rounded bg-transparent px-1 text-xs font-semibold outline-none"
                                                        value={actTitleDrafts[group.act.id] ?? group.act.title}
                                                        onChange={(event) => setActTitleDrafts((current) => ({ ...current, [group.act!.id]: event.target.value }))}
                                                        onBlur={(event) => renameAct(group.act!, event.target.value)}
                                                        onKeyDown={(event) => {
                                                            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
                                                        }}
                                                        aria-label="幕标题"
                                                    />
                                                ) : (
                                                    <span className="min-w-0 flex-1 px-1 text-xs font-semibold opacity-80">{group.actTitle}</span>
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
                                        ) : null}
                                        {group.beats.map(({ beat, index }) => renderBeatRow(beat, index))}
                                    </div>
                                ))}
                                {!beats.length ? <div className="px-4 py-8 text-center text-xs opacity-45">还没有分镜。先在左侧写剧本，再点顶部「AI 拆解」，或直接「新增分镜」。</div> : null}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}

            {step === 2 ? (
                <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <div className="text-sm font-medium opacity-70">准备资产</div>
                        <div className="flex items-center gap-3">
                            {missingAssetCount ? <span className="text-xs opacity-55">检测到 {missingAssetCount} 个资产还没有设定图</span> : <span className="text-xs opacity-45">全部资产已有设定图</span>}
                            <Button size="small" type="primary" ghost disabled={!missingAssetCount} onClick={onGenerateAllAssets}>
                                一键补齐设定图
                            </Button>
                        </div>
                    </div>
                    <div className="mb-3 rounded-lg border px-3 py-2 text-[11px] leading-5 opacity-55" style={{ borderColor: theme.toolbar.border }}>
                        资产设定图是分镜一致性的锚点：生成后在画布左侧列逐个确认，分镜生成时按角色/场景自动带入为垫图。资产可从分镜内容引用（步骤 1 展开分镜行设置角色/场景）。
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        {assetZones.map((zone) => {
                            const zoneAssets = assets.filter((asset) => asset.kind === zone.kind);
                            return (
                                <div key={zone.kind} className="flex min-h-0 flex-col rounded-xl border p-3" style={{ borderColor: theme.toolbar.border }}>
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-xs font-medium opacity-70">{zone.label}</span>
                                        <span className="text-[11px] opacity-45">{zoneAssets.length} 项</span>
                                    </div>
                                    <div className="space-y-2">
                                        {zoneAssets.map((asset) => renderAssetCard(asset))}
                                        {!zoneAssets.length ? <div className="rounded-lg border border-dashed px-3 py-4 text-center text-[11px] opacity-40" style={{ borderColor: theme.toolbar.border }}>暂无{zone.label}</div> : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                        <Select size="small" style={{ width: 84 }} value={newAsset.kind} onChange={(kind) => setNewAsset((current) => ({ ...current, kind }))} options={[{ value: "character", label: "角色" }, { value: "scene", label: "场景" }, { value: "prop", label: "道具" }]} />
                        <input className="h-7 w-56 rounded border px-2 text-xs outline-none" value={newAsset.name} placeholder="资产名称" onChange={(event) => setNewAsset((current) => ({ ...current, name: event.target.value }))} style={fieldStyle} />
                        <Button
                            size="small"
                            icon={<Plus className="size-3.5" />}
                            disabled={!newAsset.name.trim()}
                            onClick={() => {
                                onAssetAdd({ id: `asset-${Date.now()}`, kind: newAsset.kind, name: newAsset.name.trim(), description: "" });
                                setNewAsset({ kind: "character", name: "" });
                            }}
                        >
                            添加资产
                        </Button>
                    </div>
                </div>
            ) : null}

            {step === 3 ? (
                <div className="flex min-h-0 flex-1 flex-col p-4">
                    <div className="mb-2 flex items-center justify-between">
                        <div className="text-sm font-medium opacity-70">合成提示词</div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs opacity-45">已合成 {synthesizedCount}/{beats.length} 镜</span>
                            <Button size="small" type="primary" ghost icon={<Sparkles className="size-3.5" />} loading={synthAllPending} disabled={!beats.length || synthesizedCount === beats.length} onClick={() => void synthesizeAll()} title="用后台默认文本模型逐镜合成，跳过已合成的分镜">
                                一键合成全部提示词
                            </Button>
                        </div>
                    </div>
                    <div className="mb-2 rounded-lg border px-3 py-2 text-[11px] leading-5 opacity-55" style={{ borderColor: theme.toolbar.border }}>
                        每镜两条提示词：分镜图提示词用于生成帧图，视频运动提示词按 起始状态 → 按秒动作 → 结束状态 → 音效/配乐 结构驱动视频。留空则生成时自动拼接分镜字段，不消耗模型。
                    </div>
                    <div className="thin-scrollbar min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
                        {beats.map((beat, index) => {
                            const ready = Boolean(beat.imagePrompt && beat.videoPrompt);
                            return (
                                <div key={beat.id} className="flex items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                                    <span className="flex size-5 shrink-0 items-center justify-center rounded text-[10px] font-semibold" style={{ background: theme.ui.controlFill, color: theme.node.muted }}>
                                        {index + 1}
                                    </span>
                                    <span className="w-32 shrink-0 truncate text-xs font-medium">{beat.title}</span>
                                    <span className="w-24 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px]" style={statusTagStyle(beat.imagePrompt ? "#22c55e" : "#8a8f98")}>
                                        帧图{beat.imagePrompt ? "已合成" : "未合成"}
                                    </span>
                                    <span className="w-24 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px]" style={statusTagStyle(beat.videoPrompt ? "#22c55e" : "#8a8f98")}>
                                        运动{beat.videoPrompt ? "已合成" : "未合成"}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-[11px] opacity-45">{(beat.videoPrompt || beat.imagePrompt || beat.content) || "—"}</span>
                                    <Button size="small" loading={synthPendingId === beat.id} disabled={!beat.content.trim() && !beat.title.trim()} onClick={() => void synthesizeBeat(beat)}>
                                        {ready ? "重新合成" : "智能合成"}
                                    </Button>
                                    <Button size="small" type="text" onClick={() => setPromptBeatId(beat.id)}>
                                        查看/编辑
                                    </Button>
                                </div>
                            );
                        })}
                        {!beats.length ? <div className="rounded-xl border border-dashed px-4 py-8 text-center text-xs opacity-45" style={{ borderColor: theme.toolbar.border }}>还没有分镜，先回步骤 1 确认镜头。</div> : null}
                    </div>
                </div>
            ) : null}

            {/* 逐镜提示词查看/编辑 */}
            <Modal open={Boolean(promptBeat)} title={promptBeat ? `第 ${beats.findIndex((beat) => beat.id === promptBeat.id) + 1} 镜：双轨提示词` : ""} onCancel={() => setPromptBeatId(null)} footer={null} width={640}>
                {promptBeat ? (
                    <div className="space-y-2">
                        <div className="text-[11px] opacity-55">分镜图提示词（生成帧图）</div>
                        <textarea
                            className="thin-scrollbar h-24 w-full resize-none rounded-lg border px-2.5 py-1.5 text-xs leading-5 outline-none"
                            value={promptBeat.imagePrompt || ""}
                            placeholder={`留空自动合成：${resolveScriptBeatImagePrompt({ ...promptBeat, imagePrompt: undefined }, assets)}`}
                            onChange={(event) => patchBeat(promptBeat, { imagePrompt: event.target.value || undefined })}
                            style={fieldStyle}
                        />
                        <div className="text-[11px] opacity-55">视频运动提示词（起始状态 → 按秒动作 → 结束状态 → 音效/配乐）</div>
                        <textarea
                            className="thin-scrollbar h-24 w-full resize-none rounded-lg border px-2.5 py-1.5 text-xs leading-5 outline-none"
                            value={promptBeat.videoPrompt || ""}
                            placeholder={`留空自动拼接：${resolveScriptBeatVideoPrompt({ ...promptBeat, videoPrompt: undefined })}`}
                            onChange={(event) => patchBeat(promptBeat, { videoPrompt: event.target.value || undefined })}
                            style={fieldStyle}
                        />
                        <div className="flex justify-end">
                            <Button size="small" type="primary" ghost icon={<Sparkles className="size-3.5" />} loading={synthPendingId === promptBeat.id} onClick={() => void synthesizeBeat(promptBeat)}>
                                智能合成提示词
                            </Button>
                        </div>
                    </div>
                ) : null}
            </Modal>

            {/* 批量导出门槛提示 */}
            <Modal open={Boolean(gateInfo)} title="批量导出前，建议先完成：" onCancel={() => setGateInfo(null)} footer={null} width={460}>
                {gateInfo ? (
                    <div className="space-y-3">
                        <div className="space-y-1.5">
                            {gateInfo.reasons.map((reason) => (
                                <div key={reason} className="rounded-lg border px-3 py-2 text-xs" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                                    {reason}
                                </div>
                            ))}
                        </div>
                        <div className="flex items-center justify-end gap-2">
                            {missingAssetCount ? (
                                <Button
                                    size="small"
                                    onClick={() => {
                                        setGateInfo(null);
                                        setStep(2);
                                    }}
                                >
                                    去准备资产
                                </Button>
                            ) : null}
                            {synthesizedCount < beats.length ? (
                                <Button
                                    size="small"
                                    onClick={() => {
                                        setGateInfo(null);
                                        setStep(3);
                                    }}
                                >
                                    去合成提示词
                                </Button>
                            ) : null}
                            <Button
                                size="small"
                                type="primary"
                                onClick={() => {
                                    setExportPlan({ target: gateInfo.target, selectedIds: beats.map((beat) => beat.id) });
                                    setGateInfo(null);
                                }}
                            >
                                仍要导出
                            </Button>
                        </div>
                    </div>
                ) : null}
            </Modal>

            {/* 批量导出逐镜勾选 */}
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
