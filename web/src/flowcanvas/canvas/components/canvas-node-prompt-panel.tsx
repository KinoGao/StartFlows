"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowUp, AtSign, BadgePlus, Camera, Check, ChevronDown, CircleCheck, CircleX, Clock3, FileText, History, Languages, LoaderCircle, Maximize2, Minimize2, MoreHorizontal, Palette, Plus, RectangleHorizontal, RotateCcw, Sparkles, Square, Tag, TriangleAlert, Users, WandSparkles } from "lucide-react";
import { App, Button, Input, InputNumber, Popover, Select, Switch, Tooltip } from "antd";

import { ModelPicker } from "@/flowcanvas/components/model-picker";
import { VideoSettingsPanel } from "@/flowcanvas/components/video-settings-panel";
import { defaultConfig, useConfigStore, useEffectiveConfig, modelOptionLabel, type AiConfig, type CanvasVideoSubject, type CustomImageStyle } from "@/flowcanvas/stores/use-config-store";
import { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { CanvasReferenceStrip } from "./canvas-reference-strip";
import { CanvasAudioSettingsPopover, type CanvasAudioSettingKey } from "./canvas-audio-settings-popover";
import { CanvasResourceMentionTextarea, normalizeAdjacentMentionLabels } from "./canvas-resource-mention-textarea";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasGenerationRun, type CanvasNodeData } from "../types";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";
import { CanvasConfirmCard } from "./canvas-confirm-card";
import { buildComposerConfirmation, type ComposerConfirmSource, type GenerationConfirmation } from "./canvas-node-generation";
import { useVideoModelCapability } from '@/flowcanvas/hooks/use-video-model-capability';
import { useSessionPricing } from "../hooks/use-session-pricing";
import { estimateCanvasTaskPoints } from "../utils/canvas-points-estimate";
import { videoRatiosForMode, type VideoGenerationMode, type VideoModelCapability } from '@/flowcanvas/services/api/model-capabilities';
import { normalizeRuntimeModelOption } from '@/flowcanvas/services/runtime-config';
import { normalizeResolutionToken, normalizeSeedanceRatio } from "@/flowcanvas/lib/seedance-video";
import { COMFY_CAPABILITY_META, listComfyWorkflows, type ComfyOutputType, type ComfyUiCapability, type ComfyWorkflow, type ComfyWorkflowField } from "@/flowcanvas/services/comfyui-workflows";
import { normalizeVideoConfig, supportedVideoMode, validateVideoReferenceCounts, videoCapabilitySignature } from "./canvas-video-capability";
import { CAMERA_APERTURES, CAMERA_BODY_OPTIONS, CAMERA_FOCAL_LENGTHS, CAMERA_LENS_OPTIONS, CANVAS_VIDEO_CAMERA_PRESETS, buildImageCameraPrompt, imageCameraSummaryLabel, videoCameraPresetPrompt, type CanvasImageCameraSettings } from "../utils/canvas-camera-presets";
import { imageStylePresetPrompt, resolveImageStylePreset } from "../utils/canvas-image-style-presets";
import { CanvasImageStyleLibrary } from "./canvas-image-style-library";
import { buildVideoSubjectPrompt, resolveVideoSubject } from "../utils/canvas-video-subjects";
import { CanvasVideoSubjectLibrary } from "./canvas-video-subject-library";

export type CanvasNodeGenerationMode = CanvasGenerationMode;

type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    onPromptChange: (nodeId: string, prompt: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => void;
    onStop: (nodeId: string) => void;
    mentionReferences?: CanvasResourceReference[];
    onRemoveReference?: (nodeId: string, referenceNodeId: string) => void;
    onImageSettingsOpenChange?: (open: boolean) => void;
    onRetry?: (nodeId: string) => void;
};

type VideoComposerMenu = "ratio" | "duration" | "style" | "camera" | "subject" | "mode" | "advanced" | null;
type ImageComposerMenu = "style" | "camera" | null;

const COMPOSER_QUICK_PROMPTS = {
    text: ["写一段更有画面感的描述", "把这段内容整理成分镜脚本", "提炼出适合生成图片的提示词"],
    image: ["保持主体不变，换成电影感光影", "把画面扩展成一张完整海报", "生成三种不同构图方案"],
    imageEdit: ["保留主体，替换背景环境", "提升细节与光影质感", "把画面改成商业广告风格"],
    video: ["镜头缓慢向前推进，保持主体一致", "让主体自然地走向镜头", "增加有层次的电影感运镜"],
    audio: ["生成一段氛围感电影配乐", "为这段内容设计情绪化音效", "生成适合短片的背景音乐"],
} as const;

function ComposerQuickPrompts({ items, theme, onSelect }: { items: readonly string[]; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onSelect: (prompt: string) => void }) {
    return (
        <div className="canvas-composer-quick-prompts mb-2 flex min-w-0 items-center gap-1.5 overflow-x-auto" data-canvas-no-zoom>
            <span className="shrink-0 px-1 text-[11px] font-medium opacity-45">尝试</span>
            {items.map((item) => (
                <button
                    key={item}
                    type="button"
                    className="canvas-composer-quick-prompt shrink-0 rounded-full border px-2.5 py-1 text-[11px] transition"
                    style={{ borderColor: theme.ui.hairline, background: theme.ui.controlFill, color: theme.node.text }}
                    onClick={(event) => {
                        event.stopPropagation();
                        onSelect(item);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    {item}
                </button>
            ))}
        </div>
    );
}

export function CanvasNodePromptPanel({ node, isRunning, onPromptChange, onConfigChange, onGenerate, onStop, mentionReferences = [], onRemoveReference, onImageSettingsOpenChange, onRetry }: CanvasNodePromptPanelProps) {
    const { message } = App.useApp();
    const globalConfig = useEffectiveConfig();
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [comfyWorkflows, setComfyWorkflows] = useState<ComfyWorkflow[]>([]);
    const [confirmMode, setConfirmMode] = useState<"auto" | "manual">("auto");
    const [pendingConfirmation, setPendingConfirmation] = useState<GenerationConfirmation | null>(null);
    const mode = defaultMode(node.type);
    const config = buildNodeConfig(globalConfig, node, mode);
    const { capability: videoCapability, isLoading: isVideoCapabilityLoading, isFetching: isVideoCapabilityFetching } = useVideoModelCapability(config.model);
    const isVideoCapabilityPending = mode === "video" && (isVideoCapabilityLoading || isVideoCapabilityFetching);
    const isVideoCapabilityUnavailable = mode === "video" && !isVideoCapabilityPending && (!videoCapability || !videoCapability.modes.length);
    const selectedVideoMode = supportedVideoMode(node.metadata?.videoGenerationMode, videoCapability);
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = node.type === CanvasNodeType.Image && Boolean(node.metadata?.content);
    const isEditingExistingContent = hasTextContent || hasImageContent;
    const [prompt, setPrompt] = useState(isEditingExistingContent ? "" : node.metadata?.composerContent ?? node.metadata?.prompt ?? "");
    useEffect(() => {
        if (node.type !== CanvasNodeType.ComfyUI) return;
        let cancelled = false;
        void listComfyWorkflows().then((items) => {
            if (!cancelled) setComfyWorkflows(items);
        }).catch(() => undefined);
        return () => { cancelled = true; };
    }, [node.type]);
    const [videoMenuOpen, setVideoMenuOpen] = useState<VideoComposerMenu>(null);
    const [imageMenuOpen, setImageMenuOpen] = useState<ImageComposerMenu>(null);
    const [mentionRequestNonce, setMentionRequestNonce] = useState(0);
    const onPromptChangeRef = useRef(onPromptChange);
    const onConfigChangeRef = useRef(onConfigChange);
    const videoConfigRef = useRef(config);
    const videoCapabilityRef = useRef(videoCapability);
    const correctedVideoConfigKeyRef = useRef("");
    const correctedModelKeyRef = useRef("");
    videoConfigRef.current = config;
    videoCapabilityRef.current = videoCapability;
    const mentionReferenceSignature = mentionReferences.map(referenceSignature).join("\u001f");
    const stableMentionReferences = useMemo(() => mentionReferences.map((reference) => ({ ...reference })), [mentionReferenceSignature]);
    const mentionLabels = useMemo(() => Array.from(new Set(stableMentionReferences.filter((item) => item.active).map((item) => item.label))).sort((a, b) => b.length - a.length), [stableMentionReferences]);
    const activeReferenceCounts = useMemo(() => stableMentionReferences.reduce((counts, reference) => {
        if (reference.active && reference.kind !== "text") counts[reference.kind] += 1;
        return counts;
    }, { image: 0, video: 0, audio: 0 }), [stableMentionReferences]);
    const selectedComfyWorkflow = mode === "comfyui" ? comfyWorkflows.find((workflow) => workflow.id === node.metadata?.comfyWorkflowId) : undefined;
    const videoReferenceValidationMessage = mode === "video" && selectedVideoMode && videoCapability
        ? validateVideoReferenceCounts(selectedVideoMode, videoCapability, activeReferenceCounts)
        : "";
    const videoPromptOptional = mode === "video"
        && selectedVideoMode !== "text-to-video"
        && activeReferenceCounts.image + activeReferenceCounts.video + activeReferenceCounts.audio > 0;
    const generationRuns = node.metadata?.generationRuns || [];
    useEffect(() => {
        onPromptChangeRef.current = onPromptChange;
        onConfigChangeRef.current = onConfigChange;
    }, [onConfigChange, onPromptChange]);
    const rawNodeModel = node.metadata?.model || "";
    const canonicalNodeModel = rawNodeModel ? normalizeRuntimeModelOption(globalConfig, rawNodeModel, mode) : "";
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
    useEffect(() => {
        const rawPrompt = isEditingExistingContent ? "" : node.metadata?.prompt || "";
        const nextPrompt = normalizePromptReferences(rawPrompt, stableMentionReferences, mentionLabels);
        setPrompt((current) => (current === nextPrompt ? current : nextPrompt));
        if (!isEditingExistingContent && nextPrompt !== rawPrompt && node.metadata?.prompt !== nextPrompt) onPromptChangeRef.current(node.id, nextPrompt);
    }, [isEditingExistingContent, mentionLabels, node.id, node.metadata?.prompt, stableMentionReferences]);

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

    const updatePrompt = (value: string) => {
        const nextPrompt = normalizePromptReferences(value, stableMentionReferences, mentionLabels);
        setPrompt((current) => (current === nextPrompt ? current : nextPrompt));
        if (!isEditingExistingContent && node.metadata?.prompt !== nextPrompt) onPromptChange(node.id, nextPrompt);
    };

    const submit = () => {
        const text = normalizePromptReferences(prompt, stableMentionReferences, mentionLabels).trim();
        if ((!text && !videoPromptOptional && mode !== "comfyui") || isRunning) return;
        if (mode === "comfyui" && !selectedComfyWorkflow) {
            message.warning("请先选择后台已分类的 ComfyUI 工作流");
            return;
        }
        if (mode === "video" && (isVideoCapabilityLoading || isVideoCapabilityFetching)) {
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
        if (mode !== "comfyui" && !isAiConfigReady(config, config.model)) {
            message.warning("\u5f53\u524d\u6a21\u578b\u6e20\u9053\u7f3a\u5c11 API Key\uff0c\u8bf7\u5148\u5b8c\u6210\u6e20\u9053\u914d\u7f6e");
            openConfigDialog(true);
            return;
        }
        const enrichedPrompt = mode === "video"
            ? enrichVideoPrompt(text, node.metadata?.videoStylePreset, node.metadata?.videoCameraPreset, resolveVideoSubject(config.videoSubjects, node.metadata?.videoSubjectId))
            : mode === "image"
                ? enrichImagePrompt(text, node.metadata?.imageStylePreset, readImageCameraSettings(node), config.customImageStyles)
                : text;
        if (confirmMode === "manual" && mode !== "comfyui") {
            const source: ComposerConfirmSource = {
                modelLabel: modelOptionLabel(config, config.model),
                count: config.count,
                size: config.size || "",
                videoSeconds: config.videoSeconds,
            };
            const references = stableMentionReferences.map((reference) => ({
                nodeId: reference.nodeId,
                kind: reference.kind,
                label: reference.label,
                title: reference.title,
                active: reference.active,
            }));
            setPendingConfirmation(buildComposerConfirmation(mode, enrichedPrompt, source, references));
            return;
        }
        onGenerate(node.id, mode, enrichedPrompt);
        setPrompt("");
    };

    const confirmCard = pendingConfirmation ? (
        <CanvasConfirmCard
            confirmation={pendingConfirmation}
            onCancel={() => setPendingConfirmation(null)}
            onConfirm={() => {
                const confirmation = pendingConfirmation;
                setPendingConfirmation(null);
                if (confirmation) onGenerate(node.id, mode, confirmation.prompt);
            }}
        />
    ) : null;

    if (mode === "video") {
        return (
            <>
            <VideoComposer
                node={node}
                config={config}
                prompt={prompt}
                references={stableMentionReferences}
                capability={videoCapability ?? undefined}
                selectedMode={selectedVideoMode}
                capabilityPending={isVideoCapabilityPending}
                capabilityUnavailable={isVideoCapabilityUnavailable}
                validationMessage={videoReferenceValidationMessage}
                isRunning={isRunning}
                theme={theme}
                openMenu={videoMenuOpen}
                mentionRequestNonce={mentionRequestNonce}
                onMenuChange={setVideoMenuOpen}
                onMentionRequest={() => setMentionRequestNonce((value) => value + 1)}
                onPromptChange={updatePrompt}
                onConfigChange={(patch) => onConfigChange(node.id, patch)}
                onRemoveReference={onRemoveReference ? (reference) => onRemoveReference(node.id, reference.nodeId) : undefined}
                onMissingConfig={() => openConfigDialog(true)}
                onGenerate={submit}
                onStop={() => onStop(node.id)}
                generationRuns={generationRuns}
                onRetry={onRetry ? () => onRetry(node.id) : undefined}
            />
            {confirmCard}
            </>
        );
    }

    if (mode === "image") {
        return (
            <>
            <ImageComposer
                node={node}
                config={config}
                prompt={prompt}
                references={stableMentionReferences}
                hasImageContent={hasImageContent}
                isRunning={isRunning}
                theme={theme}
                openMenu={imageMenuOpen}
                mentionRequestNonce={mentionRequestNonce}
                onMenuChange={setImageMenuOpen}
                onMentionRequest={() => setMentionRequestNonce((value) => value + 1)}
                onPromptChange={updatePrompt}
                onConfigChange={(patch) => onConfigChange(node.id, patch)}
                onRemoveReference={onRemoveReference ? (reference) => onRemoveReference(node.id, reference.nodeId) : undefined}
                onMissingConfig={() => openConfigDialog(true)}
                onSettingsOpenChange={(open) => {
                    if (open) setImageMenuOpen(null);
                    onImageSettingsOpenChange?.(open);
                }}
                onGenerate={submit}
                onStop={() => onStop(node.id)}
                generationRuns={generationRuns}
                onRetry={onRetry ? () => onRetry(node.id) : undefined}
            />
            {confirmCard}
            </>
        );
    }

    return (
        <>
        <div
            className="creative-os-composer min-w-0 overflow-hidden border px-4 py-3"
            style={{ background: theme.ui.materialElevated, borderColor: theme.ui.hairline, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => { if (!event.ctrlKey && !event.metaKey) event.stopPropagation(); }}
        >
            <GenerationRunStrip runs={generationRuns} theme={theme} onRetry={onRetry ? () => onRetry(node.id) : undefined} />
            {mode === "comfyui" && selectedComfyWorkflow?.fields.length ? (
                <ComfyWorkflowComposerFields
                    fields={selectedComfyWorkflow.fields}
                    values={node.metadata?.comfyFieldValues || {}}
                    references={stableMentionReferences}
                    onValuesChange={(fieldId, value) => onConfigChange(node.id, { comfyFieldValues: { ...(node.metadata?.comfyFieldValues || {}), [fieldId]: value } })}
                />
            ) : (
                <div className="relative">
                    <CanvasResourceMentionTextarea
                        ref={textareaRef}
                        value={prompt}
                        references={mentionReferences}
                        placeholder={promptPlaceholder(mode, hasImageContent, hasTextContent)}
                        onChange={updatePrompt}
                        mentionRequestNonce={mentionRequestNonce}
                        onSubmit={submit}
                        className="w-full resize-none border-0 bg-transparent px-1 pb-4 pr-9 pt-1 text-[14px] leading-6 outline-none placeholder:opacity-35"
                    />
                    <button
                        type="button"
                        className="creative-os-icon-button absolute right-0 top-0 !size-7"
                        aria-label="展开输入框"
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                    >
                        <Maximize2 className="size-4" />
                    </button>
                </div>
            )}
            {mode !== "comfyui" && !prompt.trim() ? (
                // video / image 模式各自有专属 Composer 快捷提示词，主面板仅剩
                // text / audio / comfyui；comfyui 节点复用文本类提示词。
                <ComposerQuickPrompts
                    items={mode === "audio" ? COMPOSER_QUICK_PROMPTS.audio : COMPOSER_QUICK_PROMPTS.text}
                    theme={theme}
                    onSelect={updatePrompt}
                />
            ) : null}
            {mode !== "comfyui" ? <CanvasReferenceStrip references={stableMentionReferences} className="mb-2" /> : null}

            <div className="creative-os-composer-actions flex min-w-0 items-center gap-2 border-t pt-2" style={{ borderColor: theme.ui.hairline }}>
                <div className="canvas-composer-tools flex min-w-0 flex-1 items-center gap-2">
                    {mode !== "comfyui" ? <CanvasPromptLibrary onSelect={updatePrompt} /> : null}
                    {mode === "comfyui" ? (
                        <ComfyUiWorkflowFilters node={node} workflows={comfyWorkflows} onConfigChange={onConfigChange} theme={theme} />
                    ) : mode === "audio" ? (
                        <>
                            <div className="w-[150px] shrink-0">
                                <ModelPicker className="!h-8" config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="audio" onMissingConfig={() => openConfigDialog(true)} fullWidth />
                            </div>
                            <CanvasAudioSettingsPopover config={config} buttonClassName="!h-8 !max-w-[150px] !justify-start !rounded-[8px] !border-transparent !px-2.5" onConfigChange={(key, value) => onConfigChange(node.id, audioConfigPatch(key, value))} />
                        </>
                    ) : (
                        <div className="w-[150px] shrink-0">
                            <ModelPicker className="!h-8" config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="text" onMissingConfig={() => openConfigDialog(true)} fullWidth />
                        </div>
                    )}
                </div>
                {mode !== "comfyui" ? <button type="button" className="creative-os-icon-button !size-8" aria-label="翻译" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}><Languages className="size-4" /></button> : null}
                <Button
                    type="primary"
                    className="creative-os-primary-action !h-9 !min-w-9 shrink-0 !rounded-full !px-0"
                    danger={isRunning}
                    disabled={!isRunning && (mode === "comfyui" ? !selectedComfyWorkflow : !prompt.trim())}
                    onClick={isRunning ? () => onStop(node.id) : submit}
                >
                    <span className="flex items-center gap-1.5">
                        {isRunning ? (
                            <>
                                <LoaderCircle className="size-4 animate-spin" />
                                <Square className="size-3.5 fill-current" />
                                <span className="text-xs font-medium">停止</span>
                            </>
                        ) : (
                            <ArrowUp className="size-4" />
                        )}
                    </span>
                </Button>
            </div>
        </div>
            {confirmCard}
        </>
    );
}

type ImageComposerProps = {
    node: CanvasNodeData;
    config: AiConfig;
    prompt: string;
    references: CanvasResourceReference[];
    hasImageContent: boolean;
    isRunning: boolean;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    openMenu: ImageComposerMenu;
    mentionRequestNonce: number;
    onMenuChange: (menu: ImageComposerMenu) => void;
    onMentionRequest: () => void;
    onPromptChange: (value: string) => void;
    onConfigChange: (patch: Partial<CanvasNodeData["metadata"]>) => void;
    onRemoveReference?: (reference: CanvasResourceReference) => void;
    onMissingConfig: () => void;
    onSettingsOpenChange: (open: boolean) => void;
    onGenerate: () => void;
    onStop: () => void;
    generationRuns: CanvasGenerationRun[];
    onRetry?: () => void;
};

function ImageComposer({
    node,
    config,
    prompt,
    references,
    hasImageContent,
    isRunning,
    theme,
    openMenu,
    mentionRequestNonce,
    onMenuChange,
    onMentionRequest,
    onPromptChange,
    onConfigChange,
    onRemoveReference,
    onMissingConfig,
    onSettingsOpenChange,
    onGenerate,
    onStop,
    generationRuns,
    onRetry,
}: ImageComposerProps) {
    const activeReferences = references.filter((reference) => reference.active);
    const selectedStyle = resolveImageStylePreset(node.metadata?.imageStylePreset, config.customImageStyles);
    const cameraSettings = readImageCameraSettings(node);
    const [expanded, setExpanded] = useState(false);

    return (
        <div
            className="creative-os-composer creative-os-image-composer min-w-0 overflow-hidden rounded-lg border px-4 pb-3 pt-3"
            style={{ background: theme.ui.materialElevated, borderColor: theme.ui.hairline, color: theme.node.text }}
            data-canvas-no-zoom
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => {
                if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
            }}
        >
            <GenerationRunStrip runs={generationRuns} theme={theme} onRetry={onRetry} />
            <CanvasReferenceStrip
                references={activeReferences}
                variant="media"
                className={activeReferences.length ? "mb-2" : ""}
                onRemove={onRemoveReference}
            />

            <div className="relative">
                <CanvasResourceMentionTextarea
                    value={prompt}
                    references={references}
                    mentionRequestNonce={mentionRequestNonce}
                    onChange={onPromptChange}
                    onSubmit={onGenerate}
                    data-canvas-no-zoom
                    containerClassName={expanded ? "min-h-[220px]" : "min-h-[112px]"}
                    className={`${expanded ? "h-[220px]" : "h-[112px]"} w-full resize-none border-0 bg-transparent px-1 pb-4 pr-9 pt-1 text-[14px] leading-6 outline-none placeholder:opacity-35`}
                    style={{ color: theme.node.text }}
                    placeholder={hasImageContent ? "描述你想如何修改这张图片，输入 @ 可引用画布素材" : "描述画面主体、环境、构图、光线与风格，输入 @ 可引用画布素材"}
                />
                <Tooltip title={expanded ? "收起输入框" : "展开输入框"}>
                    <button type="button" className="creative-os-icon-button absolute right-0 top-0 !size-7" aria-label={expanded ? "收起输入框" : "展开输入框"} onClick={() => setExpanded((value) => !value)}>
                        {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                    </button>
                </Tooltip>
            </div>
            {!prompt.trim() ? (
                <ComposerQuickPrompts
                    items={hasImageContent ? COMPOSER_QUICK_PROMPTS.imageEdit : COMPOSER_QUICK_PROMPTS.image}
                    theme={theme}
                    onSelect={onPromptChange}
                />
            ) : null}

            <div className="image-composer-toolbar sticky bottom-0 -mx-4 flex h-11 min-w-0 items-center gap-1 border-t px-4 pt-2" style={{ background: theme.ui.materialElevated, borderColor: theme.ui.hairline }}>
                <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden">
                    <CanvasPromptLibrary onSelect={onPromptChange} icon={<Plus className="size-4" />} tooltip="添加提示词" />

                    <Tooltip title="引用画布中的图片或文本素材">
                        <button
                            type="button"
                            className="video-composer-tool-button"
                            style={{ color: theme.node.text }}
                            aria-label="引用素材"
                            onClick={onMentionRequest}
                        >
                            <AtSign className="size-4" />
                            <span>引用</span>
                        </button>
                    </Tooltip>

                    <ComposerPopover
                        open={openMenu === "style"}
                        onOpenChange={(open) => onMenuChange(open ? "style" : null)}
                        content={
                            <CanvasImageStyleLibrary
                                value={node.metadata?.imageStylePreset || ""}
                                currentPrompt={prompt}
                                theme={theme}
                                onChange={(id) => {
                                    onConfigChange({ imageStylePreset: id || undefined });
                                    onMenuChange(null);
                                }}
                            />
                        }
                    >
                        <ComposerToolbarButton icon={<Palette className="size-3.5" />} label={selectedStyle.shortLabel} active={openMenu === "style"} theme={theme} />
                    </ComposerPopover>

                    <ComposerPopover
                        open={openMenu === "camera"}
                        onOpenChange={(open) => onMenuChange(open ? "camera" : null)}
                        content={
                            <ImageCameraSettingsPanel
                                settings={cameraSettings}
                                theme={theme}
                                onChange={(patch) => onConfigChange(patch)}
                            />
                        }
                    >
                        <ComposerToolbarButton icon={<Camera className="size-3.5" />} label={imageCameraSummaryLabel(cameraSettings)} active={openMenu === "camera"} theme={theme} />
                    </ComposerPopover>

                    <div className="w-[210px] shrink-0">
                        <ModelPicker
                            config={config}
                            value={config.model}
                            capability="image"
                            className="!h-8"
                            fullWidth
                            onChange={(model) => onConfigChange({ model })}
                            onMissingConfig={onMissingConfig}
                        />
                    </div>

                    <CanvasImageSettingsPopover
                        config={config}
                        referenceCount={activeReferences.filter((reference) => reference.kind === "image").length}
                        placement="topRight"
                        variant="composer"
                        summaryMode="dimensions"
                        buttonIcon={<RectangleHorizontal className="size-3.5" />}
                        buttonClassName="video-composer-tool-button !max-w-[160px] !border-0 !px-2"
                        onConfigChange={(key, value) => onConfigChange(key === "count" ? { count: Number(value) || 1 } : { [key]: value })}
                        onMissingConfig={onMissingConfig}
                        onOpenChange={onSettingsOpenChange}
                    />
                </div>

                <Tooltip title={isRunning ? "停止生成" : "生成图片"}>
                    <Button
                        type="primary"
                        danger={isRunning}
                        className="creative-os-primary-action !ml-1 !size-9 !min-w-9 shrink-0 !rounded-full !p-0"
                        disabled={!isRunning && !prompt.trim()}
                        aria-label={isRunning ? "停止生成" : "生成图片"}
                        onClick={isRunning ? onStop : onGenerate}
                    >
                        {isRunning ? <Square className="size-3.5 fill-current" /> : <ArrowUp className="size-4" />}
                    </Button>
                </Tooltip>
            </div>
        </div>
    );
}

type VideoComposerProps = {
    node: CanvasNodeData;
    config: AiConfig;
    prompt: string;
    references: CanvasResourceReference[];
    capability?: VideoModelCapability;
    selectedMode?: VideoGenerationMode;
    capabilityPending: boolean;
    capabilityUnavailable: boolean;
    validationMessage: string;
    isRunning: boolean;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    openMenu: VideoComposerMenu;
    mentionRequestNonce: number;
    onMenuChange: (menu: VideoComposerMenu) => void;
    onMentionRequest: () => void;
    onPromptChange: (value: string) => void;
    onConfigChange: (patch: Partial<CanvasNodeData["metadata"]>) => void;
    onRemoveReference?: (reference: CanvasResourceReference) => void;
    onMissingConfig: () => void;
    onGenerate: () => void;
    onStop: () => void;
    generationRuns: CanvasGenerationRun[];
    onRetry?: () => void;
};

function VideoComposer({
    node,
    config,
    prompt,
    references,
    capability,
    selectedMode,
    capabilityPending,
    capabilityUnavailable,
    validationMessage,
    isRunning,
    theme,
    openMenu,
    mentionRequestNonce,
    onMenuChange,
    onMentionRequest,
    onPromptChange,
    onConfigChange,
    onRemoveReference,
    onMissingConfig,
    onGenerate,
    onStop,
    generationRuns,
    onRetry,
}: VideoComposerProps) {
    const ratios = capability ? videoRatiosForMode(capability, selectedMode) : [];
    const currentRatio = ratios.includes(normalizeSeedanceRatio(config.size)) ? normalizeSeedanceRatio(config.size) : ratios[0];
    const durations = capability?.durations || [];
    const currentDuration = durations.includes(Number(config.videoSeconds)) ? Number(config.videoSeconds) : durations[0];
    const selectedStyle = VIDEO_STYLE_PRESETS.find((item) => item.id === node.metadata?.videoStylePreset) || VIDEO_STYLE_PRESETS[0];
    const selectedCamera = CANVAS_VIDEO_CAMERA_PRESETS.find((item) => item.id === node.metadata?.videoCameraPreset) || CANVAS_VIDEO_CAMERA_PRESETS[0];
    const selectedSubject = resolveVideoSubject(config.videoSubjects, node.metadata?.videoSubjectId);
    const activeReferences = references.filter((reference) => reference.active);
    const disabled = capabilityPending || capabilityUnavailable;
    const canGenerate = Boolean(prompt.trim() || (selectedMode !== "text-to-video" && activeReferences.some((reference) => reference.kind !== "text")));
    const [expanded, setExpanded] = useState(false);
    const pricing = useSessionPricing();
    const estimatedPoints = pricing
        ? estimateCanvasTaskPoints(pricing, {
              type: "video",
              model: node.metadata?.model || config.videoModel || config.model,
              quality: node.metadata?.vquality || config.vquality,
              seconds: Number(node.metadata?.seconds || config.videoSeconds) || undefined,
          })
        : null;
    const menuOpen = (menu: Exclude<VideoComposerMenu, null>) => openMenu === menu;
    const setMenuOpen = (menu: Exclude<VideoComposerMenu, null>, open: boolean) => onMenuChange(open ? menu : null);
    const stopCanvasEvent = {
        onMouseDown: (event: React.MouseEvent) => event.stopPropagation(),
        onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
    };

    return (
        <div
            className="creative-os-composer creative-os-video-composer min-w-0 overflow-hidden rounded-lg border px-4 pb-3 pt-3"
            style={{ background: theme.ui.materialElevated, borderColor: theme.ui.hairline, color: theme.node.text }}
            data-canvas-no-zoom
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => {
                if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
            }}
        >
            <GenerationRunStrip runs={generationRuns} theme={theme} onRetry={onRetry} />

            {/* 顶排创作 chips（对齐 LibTV composer：参考 / 特效 / 角色库 / 运镜）；「标记」为 AI 元素选择能力，暂无对应实现，不摆空入口 */}
            <div className="mb-2 flex items-center gap-1 overflow-x-auto overflow-y-hidden">
                <Tooltip title="引用画布中的图片、视频、音频或文本">
                    <button type="button" className="video-composer-tool-button" style={{ color: theme.node.text }} aria-label="参考" onClick={onMentionRequest}>
                        <Plus className="size-4" />
                        <span>参考</span>
                    </button>
                </Tooltip>

                <ComposerPopover
                    open={menuOpen("style")}
                    onOpenChange={(open) => setMenuOpen("style", open)}
                    content={
                        <PresetGrid
                            title="特效库"
                            items={VIDEO_STYLE_PRESETS}
                            value={selectedStyle.id}
                            theme={theme}
                            onChange={(id) => {
                                onConfigChange({ videoStylePreset: id || undefined });
                                onMenuChange(null);
                            }}
                        />
                    }
                >
                    <ComposerToolbarButton icon={<Palette className="size-3.5" />} label={selectedStyle.id === VIDEO_STYLE_PRESETS[0].id ? "特效" : selectedStyle.shortLabel} active={menuOpen("style")} theme={theme} />
                </ComposerPopover>

                <ComposerPopover
                    open={menuOpen("subject")}
                    onOpenChange={(open) => setMenuOpen("subject", open)}
                    content={
                        <CanvasVideoSubjectLibrary
                            value={selectedSubject?.id || ""}
                            theme={theme}
                            onChange={(subjectId) => {
                                onConfigChange({ videoSubjectId: subjectId || undefined });
                                onMenuChange(null);
                            }}
                        />
                    }
                >
                    <ComposerToolbarButton icon={<Users className="size-3.5" />} label={selectedSubject ? selectedSubject.name : "角色库"} active={menuOpen("subject")} theme={theme} />
                </ComposerPopover>

                <ComposerPopover
                    open={menuOpen("camera")}
                    onOpenChange={(open) => setMenuOpen("camera", open)}
                    content={
                        <PresetGrid
                            title="运镜库"
                            items={CANVAS_VIDEO_CAMERA_PRESETS}
                            value={selectedCamera.id}
                            theme={theme}
                            onChange={(id) => {
                                onConfigChange({ videoCameraPreset: id || undefined });
                                onMenuChange(null);
                            }}
                        />
                    }
                >
                    <ComposerToolbarButton icon={<Camera className="size-3.5" />} label={selectedCamera.id === CANVAS_VIDEO_CAMERA_PRESETS[0].id ? "运镜" : selectedCamera.shortLabel} active={menuOpen("camera")} theme={theme} />
                </ComposerPopover>
            </div>

            <CanvasReferenceStrip
                references={activeReferences}
                variant="media"
                className={activeReferences.length ? "mb-2" : ""}
                onRemove={onRemoveReference}
            />

            <div className="relative">
                <CanvasResourceMentionTextarea
                    value={prompt}
                    references={references}
                    mentionRequestNonce={mentionRequestNonce}
                    onChange={onPromptChange}
                    onSubmit={onGenerate}
                    data-canvas-no-zoom
                    containerClassName={expanded ? "min-h-[220px]" : "min-h-[112px]"}
                    className={`${expanded ? "h-[220px]" : "h-[112px]"} w-full resize-none border-0 bg-transparent px-1 pb-4 pr-9 pt-1 text-[14px] leading-6 outline-none placeholder:opacity-35`}
                    style={{ color: theme.node.text }}
                    placeholder="描述视频主体、动作、环境、镜头与声音，输入 @ 可引用画布素材"
                />
                <Tooltip title={expanded ? "收起输入框" : "展开输入框"}>
                    <button type="button" className="creative-os-icon-button absolute right-0 top-0 !size-7" aria-label={expanded ? "收起输入框" : "展开输入框"} onClick={() => setExpanded((value) => !value)}>
                        {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
                    </button>
                </Tooltip>
            </div>
            {!prompt.trim() ? <ComposerQuickPrompts items={COMPOSER_QUICK_PROMPTS.video} theme={theme} onSelect={onPromptChange} /> : null}

            {capabilityPending || capabilityUnavailable ? (
                <ComposerNotice
                    icon={capabilityPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <TriangleAlert className="size-3.5" />}
                    text={capabilityPending ? "正在读取当前模型的视频能力" : "当前模型未配置可用的视频生成能力"}
                    theme={theme}
                />
            ) : null}
            {validationMessage ? <ComposerNotice icon={<TriangleAlert className="size-3.5" />} text={validationMessage} theme={theme} danger /> : null}

            <div className="video-composer-toolbar sticky bottom-0 -mx-4 flex h-11 min-w-0 items-center gap-1 border-t px-4 pt-2" style={{ background: theme.ui.materialElevated, borderColor: theme.ui.hairline }}>
                <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden">
                    <CanvasPromptLibrary onSelect={onPromptChange} icon={<Plus className="size-4" />} tooltip="添加提示词" />
                    <div className="w-[190px] shrink-0">
                        <ModelPicker
                            config={config}
                            value={config.model}
                            capability="video"
                            className="!h-8"
                            fullWidth
                            onChange={(model) => onConfigChange({ model })}
                            onMissingConfig={onMissingConfig}
                        />
                    </div>

                    <ComposerPopover
                        open={menuOpen("ratio")}
                        onOpenChange={(open) => setMenuOpen("ratio", open)}
                        content={
                            <ComposerOptionMenu title="画面比例" width={176} theme={theme}>
                                {ratios.map((ratio) => (
                                    <ComposerOption
                                        key={ratio}
                                        selected={currentRatio === ratio}
                                        icon={<RatioIcon ratio={ratio} />}
                                        label={videoRatioLabel(ratio)}
                                        theme={theme}
                                        onClick={() => {
                                            onConfigChange({ size: ratio });
                                            onMenuChange(null);
                                        }}
                                    />
                                ))}
                            </ComposerOptionMenu>
                        }
                    >
                        <ComposerToolbarButton icon={<RectangleHorizontal className="size-3.5" />} label={videoRatioLabel(currentRatio || "adaptive")} active={menuOpen("ratio")} disabled={disabled || !ratios.length} theme={theme} />
                    </ComposerPopover>

                    <ComposerPopover
                        open={menuOpen("duration")}
                        onOpenChange={(open) => setMenuOpen("duration", open)}
                        content={
                            <DurationMenu
                                durations={durations}
                                value={currentDuration}
                                theme={theme}
                                onChange={(seconds) => onConfigChange({ seconds: String(seconds) })}
                            />
                        }
                    >
                        <ComposerToolbarButton icon={<Clock3 className="size-3.5" />} label={videoDurationLabel(currentDuration)} active={menuOpen("duration")} disabled={disabled || !durations.length} theme={theme} compact />
                    </ComposerPopover>

                    <ComposerPopover
                        open={menuOpen("mode")}
                        onOpenChange={(open) => setMenuOpen("mode", open)}
                        content={
                            <ComposerOptionMenu title="参考方式" width={218} theme={theme}>
                                {(capability?.modes || []).map((mode) => (
                                    <ComposerOption
                                        key={mode}
                                        selected={selectedMode === mode}
                                        icon={VIDEO_GENERATION_MODES[mode].icon}
                                        label={VIDEO_GENERATION_MODE_LABELS[mode]}
                                        theme={theme}
                                        onClick={() => {
                                            onConfigChange({ videoGenerationMode: mode });
                                            onMenuChange(null);
                                        }}
                                    />
                                ))}
                            </ComposerOptionMenu>
                        }
                    >
                        <ComposerToolbarButton
                            icon={selectedMode ? VIDEO_GENERATION_MODES[selectedMode].icon : <BadgePlus className="size-3.5" />}
                            label={selectedMode ? VIDEO_GENERATION_MODE_LABELS[selectedMode] : "参考方式"}
                            active={menuOpen("mode")}
                            disabled={disabled}
                            theme={theme}
                        />
                    </ComposerPopover>

                    <ComposerPopover
                        open={menuOpen("advanced")}
                        onOpenChange={(open) => setMenuOpen("advanced", open)}
                        content={
                            <div className="w-[520px] max-w-[calc(100vw-32px)] p-2" {...stopCanvasEvent}>
                                <div className="mb-3 flex items-center gap-2 px-1 text-sm font-semibold">
                                    <WandSparkles className="size-4" />
                                    视频高级设置
                                </div>
                                <VideoSettingsPanel
                                    config={config}
                                    generationMode={selectedMode}
                                    theme={theme}
                                    showTitle={false}
                                    variant="composer"
                                    className="w-full"
                                    onConfigChange={(key, value) => onConfigChange(videoConfigPatch(key, value))}
                                />
                            </div>
                        }
                    >
                        <ComposerToolbarButton icon={<MoreHorizontal className="size-4" />} label="更多" active={menuOpen("advanced")} theme={theme} compact />
                    </ComposerPopover>
                </div>

                {estimatedPoints != null && !isRunning ? (
                    <span className="mr-1 shrink-0 whitespace-nowrap text-[11px]" style={{ color: theme.node.muted }} title="按当前模型与参数估算，实际以服务端扣费为准">
                        ⚡约{estimatedPoints}积分
                    </span>
                ) : null}
                <Tooltip title={isRunning ? "停止生成" : "生成视频"}>
                    <Button
                        type="primary"
                        danger={isRunning}
                        className="creative-os-primary-action !ml-1 !size-9 !min-w-9 shrink-0 !rounded-full !p-0"
                        disabled={!isRunning && (!canGenerate || disabled || Boolean(validationMessage))}
                        aria-label={isRunning ? "停止生成" : "生成视频"}
                        onClick={isRunning ? onStop : onGenerate}
                    >
                        {isRunning ? <Square className="size-3.5 fill-current" /> : <ArrowUp className="size-4" />}
                    </Button>
                </Tooltip>
            </div>
        </div>
    );
}

function ComposerPopover({ open, onOpenChange, content, children }: { open: boolean; onOpenChange: (open: boolean) => void; content: ReactNode; children: ReactNode }) {
    return (
        <Popover
            open={open}
            trigger="click"
            placement="topLeft"
            arrow={false}
            overlayClassName="video-composer-popover"
            content={<div data-canvas-no-zoom>{content}</div>}
            onOpenChange={onOpenChange}
        >
            <span className="inline-flex shrink-0">{children}</span>
        </Popover>
    );
}

function GenerationRunStrip({ runs, theme, onRetry }: { runs: CanvasGenerationRun[]; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onRetry?: () => void }) {
    const latest = runs[0];
    if (!latest) return null;

    const statusLabel = latest.status === "running" ? "运行中" : latest.status === "succeeded" ? "已完成" : latest.status === "failed" ? "失败" : "已停止";
    const statusIcon = latest.status === "running"
        ? <LoaderCircle className="size-3.5 animate-spin" />
        : latest.status === "succeeded"
          ? <CircleCheck className="size-3.5" />
          : latest.status === "failed"
            ? <CircleX className="size-3.5" />
            : <RotateCcw className="size-3.5" />;
    const statusColor = latest.status === "failed" ? theme.ui.danger : latest.status === "succeeded" ? theme.ui.accent : theme.node.text;

    return (
        <div className="mb-2 flex min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px]" style={{ background: theme.ui.controlFill, borderColor: theme.ui.hairline, color: theme.node.muted }}>
            <span className="flex shrink-0 items-center gap-1.5" style={{ color: statusColor }}>
                {statusIcon}
                <span className="font-medium">{statusLabel}</span>
            </span>
            {latest.status === "running" ? <span className="truncate opacity-70">刷新页面后会继续处理</span> : latest.model ? <span className="min-w-0 truncate opacity-60">{latest.model}</span> : null}
            <Popover
                trigger="click"
                placement="topLeft"
                arrow={false}
                content={
                    <div className="w-[300px] max-w-[calc(100vw-32px)]" style={{ color: theme.node.text }}>
                        <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold">
                            <span>最近运行</span>
                            <span className="font-normal opacity-50">{runs.length} 条</span>
                        </div>
                        <div className="grid gap-1">
                            {runs.map((run) => (
                                <div key={run.id} className="rounded-md border px-2.5 py-2" style={{ background: theme.ui.controlFill, borderColor: theme.ui.hairline }}>
                                    <div className="flex items-center justify-between gap-2 text-[11px]">
                                        <span className="font-medium">{run.status === "running" ? "运行中" : run.status === "succeeded" ? "已完成" : run.status === "failed" ? "失败" : "已停止"}</span>
                                        <time className="opacity-50">{formatGenerationRunTime(run.updatedAt)}</time>
                                    </div>
                                    {run.model ? <div className="mt-1 truncate text-[10px] opacity-55">{run.model}</div> : null}
                                    {run.errorDetails ? <div className="mt-1 line-clamp-2 text-[10px] leading-4" style={{ color: theme.ui.danger }}>{run.errorDetails}</div> : null}
                                </div>
                            ))}
                        </div>
                    </div>
                }
            >
                <button type="button" className="ml-auto inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 opacity-70 transition hover:opacity-100" style={{ color: theme.node.text }} aria-label="查看最近运行记录">
                    <History className="size-3.5" />
                    <span>{runs.length}</span>
                </button>
            </Popover>
            {latest.status === "failed" && onRetry ? (
                <button type="button" className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-1 font-medium transition hover:opacity-75" style={{ color: theme.ui.accent }} onClick={onRetry}>
                    <RotateCcw className="size-3.5" />
                    <span>重试</span>
                </button>
            ) : null}
        </div>
    );
}

function formatGenerationRunTime(timestamp: number) {
    return new Date(timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function ComposerToolbarButton({ icon, label, active, disabled, theme, compact = false }: { icon: ReactNode; label: string; active?: boolean; disabled?: boolean; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; compact?: boolean }) {
    return (
        <button
            type="button"
            disabled={disabled}
            className="video-composer-tool-button"
            style={{ background: active ? theme.ui.controlFill : "transparent", color: theme.node.text }}
            aria-label={label}
            title={label}
        >
            {icon}
            {compact ? null : <span className="max-w-[110px] truncate">{label}</span>}
            <ChevronDown className="size-3 shrink-0 opacity-55" />
        </button>
    );
}

function ComposerOptionMenu({ title, width, theme, children }: { title: string; width: number; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; children: ReactNode }) {
    return (
        <div className="p-1" style={{ width, color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <div className="px-2 pb-1.5 pt-1 text-xs font-medium" style={{ color: theme.node.muted }}>{title}</div>
            <div className="grid gap-0.5">{children}</div>
        </div>
    );
}

function ComposerOption({ selected, icon, label, theme, onClick }: { selected: boolean; icon: ReactNode; label: string; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onClick: () => void }) {
    return (
        <button
            type="button"
            className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-opacity hover:opacity-75"
            style={{ background: selected ? theme.ui.controlFill : "transparent", color: theme.node.text }}
            onClick={onClick}
        >
            <span className="grid size-4 shrink-0 place-items-center">{icon}</span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {selected ? <Check className="size-3.5" /> : null}
        </button>
    );
}

function DurationMenu({ durations, value, theme, onChange }: { durations: number[]; value?: number; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onChange: (value: number) => void }) {
    const index = Math.max(0, durations.indexOf(value ?? durations[0]));
    const selected = durations[index];
    return (
        <div className="w-[280px] p-3" style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between text-xs">
                <span style={{ color: theme.node.muted }}>视频时长</span>
                <span className="rounded-md border px-2 py-1 font-semibold" style={{ borderColor: theme.ui.hairline }}>{videoDurationLabel(selected)}</span>
            </div>
            <input
                className="video-composer-range w-full"
                type="range"
                min={0}
                max={Math.max(0, durations.length - 1)}
                step={1}
                value={index}
                disabled={durations.length < 2}
                onChange={(event) => onChange(durations[Number(event.target.value)])}
                aria-label="视频时长"
            />
            <div className="mt-2 flex justify-between text-[10px]" style={{ color: theme.node.muted }}>
                <span>{videoDurationLabel(durations[0])}</span>
                <span>{videoDurationLabel(durations[durations.length - 1])}</span>
            </div>
        </div>
    );
}

type VideoPreset = {
    id: string;
    label: string;
    shortLabel: string;
    description: string;
    prompt: string;
    tone: string;
};

function PresetGrid({ title, items, value, theme, onChange }: { title: string; items: VideoPreset[]; value: string; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onChange: (value: string) => void }) {
    return (
        <div className="w-[430px] max-w-[calc(100vw-32px)] p-2" style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <div className="px-1 pb-2 text-sm font-semibold">{title}</div>
            <div className="grid max-h-[340px] grid-cols-3 gap-2 overflow-y-auto max-[480px]:grid-cols-2">
                {items.map((item) => (
                    <button
                        key={item.id || "default"}
                        type="button"
                        className="group relative min-h-[74px] overflow-hidden rounded-md border p-2 text-left transition hover:-translate-y-px"
                        style={{ background: item.tone, borderColor: value === item.id ? theme.ui.accent : theme.ui.hairline, color: theme.node.text }}
                        onClick={() => onChange(item.id)}
                    >
                        <span className="block text-xs font-semibold">{item.label}</span>
                        <span className="mt-1 line-clamp-2 block text-[10px] leading-4 opacity-65">{item.description}</span>
                        {value === item.id ? <Check className="absolute right-2 top-2 size-3.5" /> : null}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ImageCameraSettingsPanel({ settings, theme, onChange }: { settings: CanvasImageCameraSettings; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onChange: (patch: Partial<CanvasNodeData["metadata"]>) => void }) {
    const groups: { title: string; options: { id: string; label: string }[]; value: string; onSelect: (id: string) => void }[] = [
        { title: "相机型号", options: CAMERA_BODY_OPTIONS, value: settings.body || "", onSelect: (id) => onChange({ imageCameraBody: id || undefined }) },
        { title: "镜头类型", options: CAMERA_LENS_OPTIONS, value: settings.lens || "", onSelect: (id) => onChange({ imageCameraLens: id || undefined }) },
        { title: "焦距", options: CAMERA_FOCAL_LENGTHS.map((value) => ({ id: value, label: value ? `${value}mm` : "不限" })), value: settings.focalLength || "", onSelect: (id) => onChange({ imageCameraFocalLength: id || undefined }) },
        { title: "光圈", options: CAMERA_APERTURES.map((value) => ({ id: value, label: value || "不限" })), value: settings.aperture || "", onSelect: (id) => onChange({ imageCameraAperture: id || undefined }) },
    ];
    return (
        <div className="w-[400px] max-w-[calc(100vw-32px)] p-2" style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <div className="px-1 pb-1 text-sm font-semibold">摄像机控制</div>
            {groups.map((group) => (
                <div key={group.title} className="px-1 pt-2">
                    <div className="pb-1.5 text-xs font-medium" style={{ color: theme.node.muted }}>{group.title}</div>
                    <div className="flex flex-wrap gap-1.5">
                        {group.options.map((option) => {
                            const selected = group.value === option.id;
                            return (
                                <button
                                    key={option.id || "default"}
                                    type="button"
                                    className="rounded-full border px-2.5 py-1 text-[11px] transition hover:opacity-80"
                                    style={{ borderColor: selected ? theme.ui.accent : theme.ui.hairline, background: selected ? theme.ui.controlFill : "transparent", color: theme.node.text }}
                                    onClick={() => group.onSelect(option.id)}
                                >
                                    {option.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
            <div className="px-1 pb-1 pt-2.5 text-[10px] leading-4" style={{ color: theme.node.muted }}>摄影参数会作为提示词片段在生成时追加，不影响原始提示词。</div>
        </div>
    );
}

function ComposerNotice({ icon, text, theme, danger = false }: { icon: ReactNode; text: string; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; danger?: boolean }) {
    return (
        <div className="mb-2 flex items-center gap-2 rounded-md border px-2.5 py-2 text-xs" style={{ borderColor: danger ? theme.ui.danger : theme.ui.hairline, color: danger ? theme.ui.danger : theme.node.muted }}>
            {icon}
            <span>{text}</span>
        </div>
    );
}

function RatioIcon({ ratio }: { ratio: string }) {
    const vertical = ratio === "9:16" || ratio === "3:4";
    const square = ratio === "1:1";
    return <span className="block rounded-[2px] border border-current" style={{ width: square ? 12 : vertical ? 8 : 15, height: square ? 12 : vertical ? 14 : 9 }} />;
}

function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video ? "video" : type === CanvasNodeType.Audio ? "audio" : type === CanvasNodeType.ComfyUI ? "comfyui" : "image";
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasNodeGenerationMode): AiConfig {
    const defaultModel = mode === "image" ? globalConfig.imageModel : mode === "video" ? globalConfig.videoModel : mode === "audio" ? globalConfig.audioModel : globalConfig.textModel;
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

const VIDEO_GENERATION_MODE_LABELS: Record<VideoGenerationMode, string> = {
    "text-to-video": "文生视频",
    "all-in-one-reference": "全能参考",
    "image-to-video": "首帧图生视频",
    "first-last-frame": "首尾帧图生视频",
    "image-reference": "图片参考",
    "multi-frame": "智能多帧",
};

const VIDEO_GENERATION_MODES: Record<VideoGenerationMode, { label: string; icon: ReactNode }> = {
    "text-to-video": { label: "文生视频", icon: <FileText className="size-3.5" /> },
    "all-in-one-reference": { label: "全能参考", icon: <BadgePlus className="size-3.5" /> },
    "image-to-video": { label: "图生视频", icon: <Camera className="size-3.5" /> },
    "first-last-frame": { label: "首尾帧", icon: <Sparkles className="size-3.5" /> },
    "image-reference": { label: "图片参考", icon: <Tag className="size-3.5" /> },
    "multi-frame": { label: "智能多帧", icon: <BadgePlus className="size-3.5" /> },
};

const VIDEO_STYLE_PRESETS: VideoPreset[] = [
    { id: "", label: "自动风格", shortLabel: "风格", description: "完全按提示词和参考素材生成", prompt: "", tone: "rgba(127,127,127,.08)" },
    { id: "cinematic", label: "电影冷调", shortLabel: "电影冷调", description: "冷暖对比、真实镜头与电影光影", prompt: "cinematic lighting, cool color grade, strong contrast, realistic lens", tone: "rgba(64,104,142,.18)" },
    { id: "documentary", label: "纪实写实", shortLabel: "纪实写实", description: "自然光线、真实材质与克制镜头", prompt: "documentary realism, natural light, authentic texture, restrained camera", tone: "rgba(88,116,92,.16)" },
    { id: "anime", label: "二维动画", shortLabel: "二维动画", description: "清晰线条、平涂色彩与动画节奏", prompt: "2D animation, clean line art, cel shading, expressive motion", tone: "rgba(132,91,157,.16)" },
    { id: "commercial", label: "商业质感", shortLabel: "商业质感", description: "干净布光、产品级细节与精致构图", prompt: "premium commercial look, polished lighting, precise composition, crisp detail", tone: "rgba(154,126,66,.16)" },
    { id: "retro", label: "复古胶片", shortLabel: "复古胶片", description: "柔和颗粒、低饱和与胶片色彩", prompt: "vintage film look, subtle grain, muted colors, analog texture", tone: "rgba(137,91,64,.16)" },
];

function videoRatioLabel(value: string) {
    if (value === "adaptive" || value === "auto") return "自动";
    if (value === "16:9") return "16:9（横屏）";
    if (value === "21:9") return "21:9（电影）";
    if (value === "9:16") return "9:16（竖屏）";
    return value;
}

function videoDurationLabel(value?: number) {
    return value === -1 ? "智能" : `${value || 5}s`;
}

function enrichVideoPrompt(prompt: string, styleId?: string, cameraId?: string, subject?: CanvasVideoSubject | null) {
    const style = VIDEO_STYLE_PRESETS.find((item) => item.id === styleId)?.prompt;
    const camera = videoCameraPresetPrompt(cameraId);
    return [buildVideoSubjectPrompt(prompt, subject || null), style, camera].filter(Boolean).join(", ");
}

function enrichImagePrompt(prompt: string, styleId?: string, cameraSettings?: CanvasImageCameraSettings, customStyles: CustomImageStyle[] = []) {
    const style = imageStylePresetPrompt(styleId, customStyles);
    const camera = buildImageCameraPrompt(cameraSettings);
    return [prompt, style, camera].filter(Boolean).join(", ");
}

function readImageCameraSettings(node: CanvasNodeData): CanvasImageCameraSettings {
    return {
        body: node.metadata?.imageCameraBody || undefined,
        lens: node.metadata?.imageCameraLens || undefined,
        focalLength: node.metadata?.imageCameraFocalLength || undefined,
        aperture: node.metadata?.imageCameraAperture || undefined,
    };
}

function promptPlaceholder(mode: CanvasNodeGenerationMode, hasImageContent: boolean, hasTextContent: boolean) {
    if (mode === "video") return "描述你想要生成的画面内容，@引用素材";
    if (mode === "audio") return "描述想要生成的音频内容";
    if (mode === "image") return hasImageContent ? "请输入你想把这张图修改成什么" : "描述想要生成的图片内容";
    if (mode === "comfyui") return "描述工作流输入，输入 @ 可引用画布素材";
    return hasTextContent ? "请输入你想要将这段文本修改成什么" : "写下你想讲的故事、场景或角色设定";
}

function videoConfigPatch(key: keyof AiConfig, value: string) {
    if (key === "count") return { count: Number(value) || 1 };
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

function referenceSignature(reference: CanvasResourceReference) {
    return [reference.id, reference.nodeId, reference.kind, reference.label, reference.title, reference.previewUrl || "", reference.storageKey || "", reference.text || "", reference.active ? "1" : "0"].join("\u001e");
}
function normalizePromptReferences(value: string, references: CanvasResourceReference[], labels: string[]) {
    let next = normalizeAdjacentMentionLabels(value, labels);
    references
        .filter((reference) => reference.active && reference.kind === "text" && reference.text?.trim())
        .forEach((reference) => {
            const text = reference.text?.trim();
            if (!text) return;
            const label = `《${reference.label}》`;
            const textIndex = next.lastIndexOf(text);
            if (textIndex < 0) return;
            const prefix = next.slice(0, textIndex);
            if (!prefix.includes(label) || next.slice(textIndex).trim() !== text) return;
            next = prefix.trimEnd();
        });
    return next;
}

const COMFY_OUTPUT_OPTIONS: Array<{ value: ComfyOutputType; label: string }> = [
    { value: "text", label: "文本" },
    { value: "image", label: "图像" },
    { value: "video", label: "视频" },
];

const COMFY_CAPABILITY_BY_OUTPUT: Record<ComfyOutputType, ComfyUiCapability[]> = {
    text: ["text-to-text", "image-to-text"],
    image: ["text-to-image", "image-to-image"],
    video: ["text-to-video", "image-to-video", "reference-video"],
};

const COMFY_CAPABILITY_HINTS: Record<ComfyUiCapability, string> = {
    "text-to-text": "输入提示词，输出文本节点",
    "image-to-text": "连接图片节点作为输入，输出文本节点（图生文 / 反推提示词）",
    "text-to-image": "输入提示词，输出图片节点",
    "image-to-image": "连接参考图节点 + 提示词，输出图片节点",
    "text-to-video": "输入提示词，输出视频节点",
    "image-to-video": "连接图片节点 + 提示词，输出视频节点",
    "reference-video": "连接图片/视频/音频参考 + 提示词，输出视频节点",
};

function ComfyUiWorkflowFilters({ node, workflows, onConfigChange, theme }: { node: CanvasNodeData; workflows: ComfyWorkflow[]; onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const selectedWorkflowId = node.metadata?.comfyWorkflowId || "";
    const selectedWorkflow = workflows.find((item) => item.id === selectedWorkflowId) || null;
    const capability = node.metadata?.comfyCapability || (selectedWorkflow?.capability as ComfyUiCapability | undefined) || "text-to-text";
    const output = COMFY_CAPABILITY_META[capability]?.output || "text";
    const workflowOptions = workflows
        .filter((item) => item.capability === capability)
        .map((item) => ({ value: item.id, label: item.title || item.name }));
    const updateCapability = (nextCapability: ComfyUiCapability) => {
        const workflowStillMatches = selectedWorkflow?.capability === nextCapability;
        onConfigChange(node.id, {
            comfyCapability: nextCapability,
            comfyWorkflowId: workflowStillMatches ? selectedWorkflowId : undefined,
            comfyFieldValues: workflowStillMatches ? node.metadata?.comfyFieldValues : {},
        });
    };

    return (
        <div className="flex min-w-0 items-center gap-1.5">
            <Select
                size="small"
                className="w-[82px] shrink-0"
                value={output}
                options={COMFY_OUTPUT_OPTIONS}
                onChange={(value: ComfyOutputType) => updateCapability(COMFY_CAPABILITY_BY_OUTPUT[value][0])}
            />
            <Select
                size="small"
                className="w-[132px] shrink-0"
                value={capability}
                options={COMFY_CAPABILITY_BY_OUTPUT[output].map((value) => ({ value, label: COMFY_CAPABILITY_META[value].label }))}
                onChange={updateCapability}
            />
            <Tooltip title={workflowOptions.length ? COMFY_CAPABILITY_HINTS[capability] : "请先在后台为工作流设置此能力分类"}>
                <Select
                    size="small"
                    className="min-w-[180px] flex-1"
                    placeholder="选择工作流"
                    value={selectedWorkflowId || undefined}
                    options={workflowOptions}
                    notFoundContent="后台暂无此分类工作流"
                    onChange={(workflowId) => onConfigChange(node.id, { comfyWorkflowId: workflowId, comfyCapability: capability, comfyFieldValues: {} })}
                />
            </Tooltip>
        </div>
    );
}

/** 后台字段顺序就是 Composer 顺序；文本、图片、视频等字段直接替换通用提示词区。 */
function ComfyWorkflowComposerFields({ fields, values, references, onValuesChange }: { fields: ComfyWorkflowField[]; values: Record<string, unknown>; references: CanvasResourceReference[]; onValuesChange: (fieldId: string, value: unknown) => void }) {
    const textReferences = references.filter((reference) => reference.active && reference.kind === "text");
    const mentionFieldStyle = "w-full resize-none rounded-lg border px-2 py-1 text-sm leading-6 outline-none placeholder:opacity-35";
    return (
        <div className="mb-3 space-y-2.5">
                {fields.map((field, index) => {
                    const value = values[field.id] ?? field.default;
                    const mediaOptions = field.type === "image" || field.type === "video" || field.type === "audio"
                        ? references.filter((reference) => reference.active && reference.kind === field.type).map((reference) => ({ value: `@[node:${reference.nodeId}]`, label: `${reference.label} · ${reference.title || field.type}` }))
                        : [];
                    return (
                        <label key={field.id} className="block">
                            <span className="mb-1 block truncate text-[11px] font-medium opacity-55" title={field.name}>{index + 1}. {field.name}</span>
                            {field.type === "number" || field.type === "slider" ? (
                                <InputNumber className="w-full" value={typeof value === "number" ? value : Number(value) || 0} min={field.min ?? undefined} max={field.max ?? undefined} step={field.step ?? undefined} onChange={(next) => onValuesChange(field.id, next)} />
                            ) : field.type === "boolean" ? (
                                <Switch checked={Boolean(value)} onChange={(next) => onValuesChange(field.id, next)} />
                            ) : field.type === "dropdown" ? (
                                <Select className="w-full" value={String(value ?? "")} options={(field.options || []).map((option) => ({ value: option, label: option }))} onChange={(next) => onValuesChange(field.id, next)} />
                            ) : field.type === "textarea" ? (
                                <CanvasResourceMentionTextarea value={String(value ?? "")} references={textReferences} onChange={(next) => onValuesChange(field.id, next)} placeholder={`输入${field.name}，@ 可引用上游文本`} className={mentionFieldStyle} />
                            ) : field.type === "image" || field.type === "video" || field.type === "audio" ? (
                                <Select className="w-full" allowClear value={value ? String(value) : undefined} options={mediaOptions} placeholder={mediaOptions.length ? `选择已连接的${field.type === "image" ? "图片" : field.type === "video" ? "视频" : "音频"}` : `请先连接${field.type === "image" ? "图片" : field.type === "video" ? "视频" : "音频"}节点`} onChange={(next) => onValuesChange(field.id, next || "")} />
                            ) : (
                                <CanvasResourceMentionTextarea value={String(value ?? "")} references={textReferences} onChange={(next) => onValuesChange(field.id, next)} placeholder={`输入${field.name}，@ 可引用上游文本`} className={mentionFieldStyle} />
                            )}
                        </label>
                    );
                })}
        </div>
    );
}
