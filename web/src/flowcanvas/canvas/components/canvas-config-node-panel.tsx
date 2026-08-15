"use client";

import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Image as ImageIcon, LoaderCircle, MessageSquare, Music2, Play, Settings2, Square, TriangleAlert, Video, Workflow } from "lucide-react";
import { App, Button, ConfigProvider, InputNumber, Segmented, Select, Switch, type SelectProps } from "antd";

import { ModelPicker } from "@/flowcanvas/components/model-picker";
import { defaultConfig, useConfigStore, useEffectiveConfig, type AiConfig } from "@/flowcanvas/stores/use-config-store";
import { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { CanvasReferenceStrip } from "./canvas-reference-strip";
import { CanvasResourceMentionTextarea, normalizeAdjacentMentionLabels } from "./canvas-resource-mention-textarea";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData, type CanvasNodeMetadata } from "../types";
import { getConfigNodeHeight } from "../constants";
import type { NodeGenerationInput } from "./canvas-node-generation";
import { listComfyWorkflows, type ComfyWorkflow, type ComfyWorkflowField } from "@/flowcanvas/services/comfyui-workflows";
import { normalizeRuntimeModelOption } from "@/flowcanvas/services/runtime-config";
import { normalizeResolutionToken, normalizeSeedanceRatio } from "@/flowcanvas/lib/seedance-video";
import { useVideoModelCapability } from "@/flowcanvas/hooks/use-video-model-capability";
import type { VideoGenerationMode } from "@/flowcanvas/services/api/model-capabilities";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";
import { VIDEO_GENERATION_MODE_LABELS, normalizeVideoConfig, supportedVideoMode, validateVideoReferenceCounts, videoCapabilitySignature } from "./canvas-video-capability";

type CanvasConfigNodePanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    inputs: NodeGenerationInput[];
    inputSummary: { textCount: number; imageCount: number; videoCount: number; audioCount: number };
    mentionReferences?: CanvasResourceReference[];
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
    onHeightChange?: (nodeId: string, height: number) => void;
    onGenerate: (nodeId: string, comfyWorkflowId?: string) => void;
    onStop: (nodeId: string) => void;
    onComposerToggle: () => void;
};

const COMFY_AUTO_EXPAND_BASE = 250;
const COMFY_AUTO_EXPAND_PER_FIELD = 88;
const COMFY_AUTO_EXPAND_MAX = 800;

const stopCanvasSelectInteraction = (event: { stopPropagation: () => void; ctrlKey?: boolean; metaKey?: boolean }) => {
    if (event.ctrlKey || event.metaKey) return; // Ctrl+滚轮放行给画布缩放
    event.stopPropagation();
};

const renderCanvasSelectPopup = (menu: ReactNode) => (
    <div className="canvas-no-zoom-popup" data-canvas-no-zoom onMouseDown={stopCanvasSelectInteraction} onPointerDown={stopCanvasSelectInteraction} onWheel={stopCanvasSelectInteraction} onWheelCapture={stopCanvasSelectInteraction}>
        {menu}
    </div>
);

function CanvasSafeSelect(props: SelectProps<string>) {
    const [open, setOpen] = useState(false);
    return (
        <div className="nodrag nopan" onMouseDown={stopCanvasSelectInteraction} onPointerDown={stopCanvasSelectInteraction} onClick={() => setOpen(true)}>
            <Select
                {...props}
                open={open}
                classNames={{ popup: { root: "canvas-no-zoom-popup" }, ...props.classNames }}
                popupRender={props.popupRender || renderCanvasSelectPopup}
                onOpenChange={(next) => {
                    setOpen(next);
                    props.onOpenChange?.(next);
                }}
                onChange={(value, option) => {
                    setOpen(false);
                    props.onChange?.(value, option);
                }}
            />
        </div>
    );
}

export function CanvasConfigNodePanel({ node, isRunning, inputs, inputSummary, mentionReferences = [], onConfigChange, onHeightChange, onGenerate, onStop, onComposerToggle }: CanvasConfigNodePanelProps) {
    const globalConfig = useEffectiveConfig();
    const comfyui = useConfigStore((state) => state.comfyui);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const { message } = App.useApp();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const antdTheme = useMemo(
        () => ({
            token: {
                colorPrimary: theme.node.activeStroke,
                colorBgContainer: theme.node.panel,
                colorBgElevated: theme.toolbar.panel,
                colorBorder: theme.node.stroke,
                colorText: theme.node.text,
                colorTextPlaceholder: theme.node.placeholder,
                colorFillSecondary: theme.toolbar.activeBg,
                borderRadius: 8,
                controlHeight: 40,
            },
        }),
        [theme],
    );
    const isStandaloneComfyUi = node.type === CanvasNodeType.ComfyUI;
    const mode = isStandaloneComfyUi ? "comfyui" : node.metadata?.generationMode || defaultModeForNode(node.type);
    const config = buildNodeConfig(globalConfig, node, mode);
    const { capability: videoCapability, isLoading: isVideoCapabilityLoading, isFetching: isVideoCapabilityFetching } = useVideoModelCapability(config.model);
    const isVideoCapabilityPending = mode === "video" && (isVideoCapabilityLoading || isVideoCapabilityFetching);
    const isVideoCapabilityUnavailable = mode === "video" && !isVideoCapabilityPending && (!videoCapability || !videoCapability.modes.length);
    const selectedVideoMode = supportedVideoMode(node.metadata?.videoGenerationMode, videoCapability);
    const videoReferenceValidationMessage = mode === "video" && videoCapability && selectedVideoMode
        ? validateVideoReferenceCounts(selectedVideoMode, videoCapability, { image: inputSummary.imageCount, video: inputSummary.videoCount, audio: inputSummary.audioCount })
        : "";
    const onConfigChangeRef = useRef(onConfigChange);
    const videoConfigRef = useRef(config);
    const videoCapabilityRef = useRef(videoCapability);
    const correctedVideoConfigKeyRef = useRef("");
    const correctedModelKeyRef = useRef("");
    videoConfigRef.current = config;
    videoCapabilityRef.current = videoCapability;
    const rawNodeModel = node.metadata?.model || "";
    const canonicalNodeModel = rawNodeModel ? normalizeRuntimeModelOption(globalConfig, rawNodeModel, mode) : "";
    const [workflows, setWorkflows] = useState<ComfyWorkflow[]>([]);
    const selectedWorkflow = useMemo(() => workflows.find((workflow) => workflow.id === (node.metadata?.comfyWorkflowId || comfyui.defaultWorkflowId)) || workflows[0], [comfyui.defaultWorkflowId, node.metadata?.comfyWorkflowId, workflows]);
    const count = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const chipStyle = { background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text };
    const hasAnyInput = Boolean(inputSummary.textCount || inputSummary.imageCount || inputSummary.videoCount || inputSummary.audioCount);
    const hasComposerContent = Boolean((node.metadata?.composerContent ?? node.metadata?.prompt ?? "").trim());
    const hasGenerationInput = hasComposerContent || (mode === "audio" ? inputSummary.textCount > 0 : hasAnyInput);
    const videoCapabilityReady = mode !== "video" || Boolean(!isVideoCapabilityPending && videoCapability?.modes.length && selectedVideoMode && !videoReferenceValidationMessage);
    const canGenerate = (mode === "comfyui" ? Boolean(selectedWorkflow) : hasGenerationInput) && videoCapabilityReady;

    useEffect(() => {
        onConfigChangeRef.current = onConfigChange;
    }, [onConfigChange]);

    useEffect(() => {
        if (!rawNodeModel || !canonicalNodeModel || rawNodeModel === canonicalNodeModel) {
            correctedModelKeyRef.current = "";
            return;
        }
        const correctionKey = [node.id, rawNodeModel, canonicalNodeModel].join("\u001f");
        if (correctedModelKeyRef.current === correctionKey) return;
        correctedModelKeyRef.current = correctionKey;
        onConfigChangeRef.current(node.id, { model: canonicalNodeModel });
    }, [canonicalNodeModel, node.id, rawNodeModel]);

    const videoCapabilityKey = videoCapabilitySignature(videoCapability);
    const videoConfigSignature = [
        node.metadata?.videoGenerationMode || "",
        normalizeSeedanceRatio(config.size),
        normalizeResolutionToken(config.vquality),
        String(config.videoSeconds),
        String(config.count),
        config.videoGenerateAudio,
        config.videoWatermark,
        config.videoDraft,
    ].join("\u001f");
    const videoModel = config.model;
    const currentVideoGenerationMode = node.metadata?.videoGenerationMode;

    useEffect(() => {
        const currentConfig = videoConfigRef.current;
        const currentCapability = videoCapabilityRef.current;
        if (mode !== "video" || isVideoCapabilityLoading || isVideoCapabilityFetching || !currentCapability?.modes.length) return;
        const patch = normalizeVideoConfig(currentVideoGenerationMode, currentConfig, currentCapability);
        const patchSignature = Object.entries(patch).map(([key, value]) => `${key}:${String(value)}`).join("|");
        if (!patchSignature) {
            correctedVideoConfigKeyRef.current = "";
            return;
        }
        const correctionKey = [node.id, videoModel, videoCapabilityKey, videoConfigSignature, patchSignature].join("\u001e");
        if (correctedVideoConfigKeyRef.current === correctionKey) return;
        correctedVideoConfigKeyRef.current = correctionKey;
        onConfigChangeRef.current(node.id, patch);
    }, [currentVideoGenerationMode, isVideoCapabilityFetching, isVideoCapabilityLoading, mode, node.id, videoCapabilityKey, videoConfigSignature, videoModel]);

    useEffect(() => {
        if (mode !== "comfyui") return;
        let cancelled = false;
        void listComfyWorkflows()
            .then((items) => {
                if (!cancelled) setWorkflows(items);
            })
            .catch(() => {
                if (!cancelled) setWorkflows([]);
            });
        return () => {
            cancelled = true;
        };
    }, [mode]);

    useEffect(() => {
        if (mode === "comfyui" && selectedWorkflow && !node.metadata?.comfyWorkflowId && !comfyui.defaultWorkflowId) {
            onConfigChange(node.id, { comfyWorkflowId: selectedWorkflow.id });
        }
    }, [comfyui.defaultWorkflowId, mode, node.id, node.metadata?.comfyWorkflowId, onConfigChange, selectedWorkflow?.id]);

    const heightRef = useRef(node.height);
    useEffect(() => {
        heightRef.current = node.height;
    }, [node.height]);

    useEffect(() => {
        if (!onHeightChange) return;
        let desired: number;
        if (mode === "comfyui") {
            if (!selectedWorkflow) return;
            const fieldsCount = selectedWorkflow.fields?.length ?? 0;
            desired = Math.min(COMFY_AUTO_EXPAND_BASE + fieldsCount * COMFY_AUTO_EXPAND_PER_FIELD, COMFY_AUTO_EXPAND_MAX);
        } else {
            desired = getConfigNodeHeight(mode);
        }
        if (desired === heightRef.current) return;
        onHeightChange(node.id, desired);
    }, [mode, node.id, onHeightChange, selectedWorkflow?.fields?.length]);

    const handlePrimaryAction = () => {
        if (isRunning) {
            onStop(node.id);
            return;
        }
        if (mode === "comfyui" && !selectedWorkflow) {
            message.warning("请先选择或配置 ComfyUI 工作流");
            window.location.assign("/admin");
            return;
        }
        if (mode === "video" && isVideoCapabilityPending) {
            message.info("正在读取当前模型的视频能力，请稍候");
            return;
        }
        if (mode === "video" && (!videoCapability || !videoCapability.modes.length || !selectedVideoMode)) {
            message.warning("当前模型未配置可用的视频生成能力，请联系管理员发布模型配置");
            return;
        }
        if (videoReferenceValidationMessage) {
            message.warning(videoReferenceValidationMessage);
            return;
        }
        if (!canGenerate) {
            message.info(mode === "audio" ? "请先输入朗读文本或连接文本节点" : "请先输入提示词或连接上游素材");
            onComposerToggle();
            return;
        }
        onGenerate(node.id, mode === "comfyui" ? selectedWorkflow?.id : undefined);
    };

    return (
        <ConfigProvider theme={antdTheme}>
        <div className="creative-os-config-panel relative flex h-full min-h-0 min-w-0 w-full cursor-default flex-col overflow-hidden rounded-[inherit] px-3 pb-3 pt-7 text-sm" style={{ color: theme.node.text, background: `linear-gradient(145deg, ${theme.node.panel}, ${theme.node.fill})` }}>
            <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-56 rounded-full blur-3xl" style={{ background: theme.ui.accentSoft }} />
            <div className="relative z-10 flex h-full min-h-0 w-full flex-col">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg border" style={{ background: theme.toolbar.activeBg, borderColor: theme.ui.accentSoft, color: theme.ui.accent }}>
                        {isStandaloneComfyUi ? <Workflow className="size-4" /> : <Settings2 className="size-4" />}
                    </span>
                    <div className="shrink-0 cursor-move text-sm font-semibold">
                    {isStandaloneComfyUi ? (
                        <span className="inline-flex items-center gap-1.5">
                            <Workflow className="size-4" />
                            ComfyUI
                        </span>
                    ) : "生成配置"}
                </div>
                </div>
                {!isStandaloneComfyUi ? (
                    <div className="creative-os-hidden-scroll min-w-0 overflow-x-auto cursor-default" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                        <Segmented
                            size="small"
                            className="!flex-nowrap !min-w-0 !rounded-md !p-0.5 [&_.ant-segmented-item]:!flex-none [&_.ant-segmented-item-label]:!whitespace-nowrap"
                            value={mode}
                            onChange={(value) => {
                                const nextMode = value as CanvasGenerationMode;
                                const nextModel = defaultModelForMode(globalConfig, nextMode);
                                onConfigChange(node.id, { generationMode: nextMode, ...(nextModel ? { model: nextModel } : {}) });
                            }}
                            options={[
                                {
                                    value: "image",
                                    label: (
                                        <span className="inline-flex items-center gap-1">
                                            <ImageIcon className="size-3.5" />
                                            生图
                                        </span>
                                    ),
                                },
                                {
                                    value: "text",
                                    label: (
                                        <span className="inline-flex items-center gap-1">
                                            <MessageSquare className="size-3.5" />
                                            文本
                                        </span>
                                    ),
                                },
                                {
                                    value: "video",
                                    label: (
                                        <span className="inline-flex items-center gap-1">
                                            <Video className="size-3.5" />
                                            视频
                                        </span>
                                    ),
                                },
                                {
                                    value: "audio",
                                    label: (
                                        <span className="inline-flex items-center gap-1">
                                            <Music2 className="size-3.5" />
                                            音频
                                        </span>
                                    ),
                                },
                                {
                                    value: "comfyui",
                                    label: (
                                        <span className="inline-flex items-center gap-1">
                                            <Workflow className="size-3.5" />
                                            ComfyUI
                                        </span>
                                    ),
                                },
                            ]}
                        />
                    </div>
                ) : null}
            </div>

            <CanvasReferenceStrip references={mentionReferences} className="mb-2" />
            <div className="mb-2 flex flex-wrap gap-1.5">
                <InputChip label="提示词" value={`${inputSummary.textCount} 个`} style={chipStyle} />
                <InputChip label="参考图" value={`${inputSummary.imageCount} 张`} style={chipStyle} />
                <InputChip label="参考视频" value={`${inputSummary.videoCount} 个`} style={chipStyle} />
                <InputChip label="参考音频" value={`${inputSummary.audioCount} 个`} style={chipStyle} />
                <button type="button" className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2 text-[11px]" style={chipStyle} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()} onClick={onComposerToggle}>
                    <Settings2 className="size-3.5" />
                    组装提示词
                </button>
            </div>

            <div
                className={`nodrag nopan mb-2 grid min-h-0 min-w-0 cursor-default gap-2 ${mode === "image" || mode === "audio" ? "grid-cols-[minmax(0,1fr)_148px] items-center" : "grid-cols-1"} ${mode === "comfyui" ? "flex-1 items-stretch" : ""}`}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                {mode === "comfyui" ? (
                    <ComfyWorkflowControls node={node} workflows={workflows} selectedWorkflow={selectedWorkflow} inputs={inputs} mentionReferences={mentionReferences} onConfigChange={onConfigChange} />
                ) : (
                    <>
                        <ModelPicker className="canvas-compact-control h-10" config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability={mode} onMissingConfig={() => openConfigDialog(true)} fullWidth />
                        {mode === "video" ? (
                            <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_148px] items-center gap-2">
                                <CanvasSafeSelect
                                    className="canvas-compact-control h-10"
                                    value={selectedVideoMode}
                                    options={(videoCapability?.modes || []).map((value) => ({ value, label: VIDEO_GENERATION_MODE_LABELS[value] }))}
                                    disabled={isVideoCapabilityPending || isVideoCapabilityUnavailable}
                                    loading={isVideoCapabilityPending}
                                    placeholder={isVideoCapabilityPending ? "读取模型能力" : "选择生成模式"}
                                    onChange={(value) => onConfigChange(node.id, { videoGenerationMode: value as VideoGenerationMode })}
                                />
                                <CanvasVideoSettingsPopover
                                    config={config}
                                    generationMode={selectedVideoMode}
                                    placement="topRight"
                                    buttonClassName="canvas-compact-control !h-10 !w-full !justify-start !rounded-lg !px-2"
                                    onConfigChange={(key, value) => onConfigChange(node.id, videoConfigPatch(key, value))}
                                />
                            </div>
                        ) : mode === "image" ? (
                            <CanvasImageSettingsPopover
                                config={config}
                                referenceCount={inputSummary.imageCount}
                                placement="topRight"
                                autoAdjustOverflow={false}
                                buttonClassName="canvas-compact-control !h-10 !w-full !justify-start !rounded-lg !px-2"
                                onConfigChange={(key, value) => onConfigChange(node.id, key === "count" ? { count: Number(value) || 1 } : { [key]: value })}
                            />
                        ) : mode === "audio" ? (
                            <CanvasAudioSettingsPopover
                                config={config}
                                placement="topRight"
                                buttonClassName="canvas-compact-control !h-10 !w-full !justify-start !rounded-lg !px-2"
                                onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))}
                            />
                        ) : null}
                    </>
                )}
            </div>

            {mode === "video" && (isVideoCapabilityPending || isVideoCapabilityUnavailable || videoReferenceValidationMessage) ? (
                <div className="mb-2 flex items-start gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] leading-4" style={{ borderColor: theme.node.stroke, background: theme.toolbar.activeBg, color: theme.node.text }}>
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                    <span>{isVideoCapabilityPending ? "正在读取当前模型的视频能力" : isVideoCapabilityUnavailable ? "当前模型尚未发布可用的视频能力配置" : videoReferenceValidationMessage}</span>
                </div>
            ) : null}

            <Button
                type="primary"
                className="creative-os-primary-action mt-auto !h-10 !w-full !cursor-pointer !rounded-[8px]"
                danger={isRunning}
                disabled={!isRunning && !canGenerate}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={handlePrimaryAction}
            >
                <span className="inline-flex items-center gap-1.5">
                    {isRunning ? (
                        <>
                            <LoaderCircle className="size-4 animate-spin" />
                            <Square className="size-3.5 fill-current" />
                            <span>停止</span>
                        </>
                    ) : (
                        <>
                            {mode === "comfyui" ? <span>{selectedWorkflow ? "本地工作流" : "配置工作流"}</span> : null}
                            <Play className="size-4" />
                            <span>开始生成</span>
                        </>
                    )}
                </span>
            </Button>
        </div>
        </div>
        </ConfigProvider>
    );
}

function ComfyWorkflowControls({
    node,
    workflows,
    selectedWorkflow,
    inputs,
    mentionReferences,
    onConfigChange,
}: {
    node: CanvasNodeData;
    workflows: ComfyWorkflow[];
    selectedWorkflow?: ComfyWorkflow;
    inputs: NodeGenerationInput[];
    mentionReferences: CanvasResourceReference[];
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeMetadata>) => void;
}) {
    const values = node.metadata?.comfyFieldValues || {};
    const updateValue = (field: ComfyWorkflowField, value: unknown) => {
        onConfigChange(node.id, { comfyFieldValues: { ...values, [field.id]: value } });
    };

    return (
        <div className="flex h-full min-h-0 min-w-0 flex-col gap-2">
            <CanvasSafeSelect
                className="canvas-compact-control h-10"
                popupMatchSelectWidth={false}
                placeholder="选择 ComfyUI 工作流"
                value={selectedWorkflow?.id}
                options={workflows.map((workflow) => ({ label: workflow.title, value: workflow.id }))}
                onChange={(comfyWorkflowId) => onConfigChange(node.id, { comfyWorkflowId })}
            />
            {selectedWorkflow?.fields.length ? (
                <div data-canvas-no-zoom className="creative-os-hidden-scroll grid min-h-0 flex-1 content-start gap-2 overflow-y-auto pr-1">
                    {selectedWorkflow.fields.map((field) => (
                        <div key={field.id} className="grid gap-1 text-[11px]">
                            <span className="truncate opacity-70">{field.name || field.input}</span>
                            <ComfyFieldControl field={field} value={values[field.id] ?? field.default} inputs={inputs} mentionReferences={mentionReferences} onChange={(value) => updateValue(field, value)} />
                        </div>
                    ))}
                </div>
            ) : selectedWorkflow ? (
                <div className="text-[11px] opacity-50">该工作流没有暴露参数，请在 ComfyUI 管理页面配置</div>
            ) : (
                <div className="rounded-md border border-dashed px-3 py-3 text-[11px] opacity-65">未找到可用工作流，点击下方“配置工作流”完成设置</div>
            )}
        </div>
    );
}

function ComfyFieldControl({ field, value, inputs, mentionReferences, onChange }: { field: ComfyWorkflowField; value: unknown; inputs: NodeGenerationInput[]; mentionReferences: CanvasResourceReference[]; onChange: (value: unknown) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const textInputStyle = { background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text };
    const mentionLabels = useMemo(() => Array.from(new Set(mentionReferences.filter((reference) => reference.active).map((reference) => reference.label))).sort((a, b) => b.length - a.length), [mentionReferences]);
    const rawTextValue = String(value ?? "");
    const textValue = normalizeAdjacentMentionLabels(rawTextValue, mentionLabels);

    if (field.type === "boolean") return <Switch size="small" checked={Boolean(value)} onChange={onChange} />;
    if (field.type === "number") return <InputNumber className="w-full" value={Number(value) || 0} onChange={(next) => onChange(Number(next) || 0)} />;
    if (field.type === "slider") return <InputNumber className="w-full" min={field.min ?? undefined} max={field.max ?? undefined} step={field.step ?? undefined} value={Number(value) || 0} onChange={(next) => onChange(Number(next) || 0)} />;
    if (field.type === "dropdown")
        return (
            <CanvasSafeSelect
                value={String(value ?? "")}
                options={(field.options || []).map((option) => ({ label: option, value: option }))}
                onChange={onChange}
            />
        );
    if (field.type === "textarea") {
        return (
            <CanvasResourceMentionTextarea
                value={textValue}
                references={mentionReferences}
                data-canvas-no-zoom
                onChange={(next) => onChange(normalizeAdjacentMentionLabels(next, mentionLabels))}
                className="thin-scrollbar min-h-20 w-full resize-y rounded-md border px-2 py-1.5 text-xs leading-5 outline-none"
                style={textInputStyle}
                placeholder="输入内容，按 @ 引用上游素材"
                onKeyDown={(event) => event.stopPropagation()}
            />
        );
    }
    if (field.type === "image" || field.type === "video" || field.type === "audio") {
        const fieldType = field.type;
        const matched = inputs.filter((input) => input.type === fieldType);
        const mentionByNodeId = new Map(mentionReferences.filter((reference) => reference.active && reference.kind === fieldType).map((reference) => [reference.nodeId, reference]));
        const currentValue = String(value ?? "");
        const isNodeRef = currentValue.startsWith("@[node:");
        return (
            <CanvasSafeSelect
                className="w-full"
                placeholder={matched.length ? "选择上游节点" : `没有可用的上游${fieldType === "image" ? "图片" : fieldType === "video" ? "视频" : "音频"}节点`}
                value={isNodeRef ? currentValue : undefined}
                options={matched.map((input) => {
                    const mention = mentionByNodeId.get(input.nodeId);
                    const label = mention ? `${mention.label} · ${input.title}` : input.title;
                    return { label, value: `@[node:${input.nodeId}]` };
                })}
                allowClear
                onChange={(next) => onChange(next ?? "")}
            />
        );
    }
    return (
        <CanvasResourceMentionTextarea
            value={textValue}
            references={mentionReferences.filter((reference) => field.type === "text" || reference.kind === field.type)}
            data-canvas-no-zoom
            onChange={(next) => onChange(normalizeAdjacentMentionLabels(next, mentionLabels))}
            className="thin-scrollbar min-h-12 w-full resize-y rounded-md border px-2 py-1.5 text-xs leading-5 outline-none"
            style={textInputStyle}
            placeholder="输入内容，按 @ 引用上游素材"
            onKeyDown={(event) => event.stopPropagation()}
        />
    );
}

function InputChip({ label, value, style }: { label: string; value: string; style: CSSProperties }) {
    return (
        <div className="inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px]" style={style}>
            <span>{label}</span>
            <span className="font-medium">{value}</span>
        </div>
    );
}

function defaultModelForMode(config: AiConfig, mode: CanvasGenerationMode) {
    if (mode === "comfyui") return "";
    if (mode === "image") return config.imageModel || config.model || defaultConfig.model;
    if (mode === "video") return config.videoModel || config.model || defaultConfig.model;
    if (mode === "audio") return config.audioModel || config.model || defaultConfig.audioModel;
    return config.textModel || config.model || defaultConfig.model;
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasGenerationMode): AiConfig {
    const defaultModel = defaultModelForMode(globalConfig, mode);
    const selectedModel = normalizeRuntimeModelOption(globalConfig, node.metadata?.model || defaultModel, mode)
        || normalizeRuntimeModelOption(globalConfig, defaultModel, mode)
        || (mode === "audio" ? defaultConfig.audioModel : globalConfig.model || defaultConfig.model);
    return {
        ...globalConfig,
        model: selectedModel,
        quality: node.metadata?.quality || globalConfig.quality || defaultConfig.quality,
        resolution: node.metadata?.resolution || globalConfig.resolution || defaultConfig.resolution,
        size: node.metadata?.size || globalConfig.size || defaultConfig.size,
        videoSeconds: node.metadata?.seconds || globalConfig.videoSeconds || defaultConfig.videoSeconds,
        vquality: node.metadata?.vquality || globalConfig.vquality || defaultConfig.vquality,
        videoGenerateAudio: node.metadata?.generateAudio || globalConfig.videoGenerateAudio || defaultConfig.videoGenerateAudio,
        videoWatermark: node.metadata?.watermark || globalConfig.videoWatermark || defaultConfig.videoWatermark,
        videoDraft: node.metadata?.draft || globalConfig.videoDraft || defaultConfig.videoDraft,
        audioVoice: node.metadata?.audioVoice || globalConfig.audioVoice || defaultConfig.audioVoice,
        audioFormat: node.metadata?.audioFormat || globalConfig.audioFormat || defaultConfig.audioFormat,
        audioSpeed: node.metadata?.audioSpeed || globalConfig.audioSpeed || defaultConfig.audioSpeed,
        audioInstructions: node.metadata?.audioInstructions || globalConfig.audioInstructions || defaultConfig.audioInstructions,
        count: String(node.metadata?.count || (mode === "image" ? globalConfig.canvasImageCount || globalConfig.count : globalConfig.count) || defaultConfig.count),
    };
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "videoSeconds") return { seconds: value };
    if (key === "videoGenerateAudio") return { generateAudio: value };
    if (key === "videoWatermark") return { watermark: value };
    if (key === "videoDraft") return { draft: value };
    return { [key]: value };
}

function audioConfigPatch(key: CanvasAudioSettingKey, value: string) {
    if (key === "audioVoice") return { audioVoice: value };
    if (key === "audioFormat") return { audioFormat: value };
    if (key === "audioSpeed") return { audioSpeed: value };
    return { audioInstructions: value };
}

function defaultModeForNode(type: CanvasNodeData["type"]): CanvasGenerationMode {
    if (type === CanvasNodeType.Video) return "video";
    if (type === CanvasNodeType.Audio) return "audio";
    if (type === CanvasNodeType.Text) return "text";
    return "image";
}
