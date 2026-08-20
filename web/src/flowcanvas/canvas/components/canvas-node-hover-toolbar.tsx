"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { App, Modal, Segmented, Tooltip } from "antd";
import { Clapperboard, Download, Ellipsis, FolderPlus, Info, LayoutGrid, MessageSquare, Minus, Music2, Pencil, Plus, RefreshCw, ScanSearch, Scissors, Settings2, Sparkles, Trash2, Upload, Video, Workflow } from "lucide-react";

import { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { formatBytes, getDataUrlByteSize } from "@/flowcanvas/lib/image-utils";
import { useCopyText } from "@/flowcanvas/hooks/use-copy-text";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeActionIntent, type CanvasNodeData, type ViewportTransform } from "../types";
import { CANVAS_SLASH_COMMANDS, type CanvasSlashCommand } from "../utils/canvas-workflow-template";
import { CANVAS_IMAGE_QUICK_COMMANDS, type CanvasImageQuickCommand } from "../utils/canvas-image-quick-commands";
import { ImageToolSettingsModal, type ImageToolbarSettingsTool } from "./canvas-image-toolbar-settings-modal";
import { IMAGE_QUICK_TOOLS_STORAGE_KEY, buildImageToolbarTools, defaultImageQuickToolIds, readImageQuickToolsConfig, type ImageQuickToolId } from "./canvas-image-toolbar-tools";

type CanvasNodeHoverToolbarProps = {
    node: CanvasNodeData | null;
    viewport: ViewportTransform;
    onKeep: (nodeId: string) => void;
    onLeave: () => void;
    onInfo: (node: CanvasNodeData) => void;
    onEditText: (node: CanvasNodeData) => void;
    onDecreaseFont: (node: CanvasNodeData) => void;
    onIncreaseFont: (node: CanvasNodeData) => void;
    onToggleDialog: (node: CanvasNodeData) => void;
    onUpload: (node: CanvasNodeData) => void;
    onMarkPanorama360: (node: CanvasNodeData) => void;
    onDownload: (node: CanvasNodeData) => void;
    onSaveAsset: (node: CanvasNodeData) => void;
    onMaskEdit: (node: CanvasNodeData) => void;
    onCrop: (node: CanvasNodeData) => void;
    onSplit: (node: CanvasNodeData) => void;
    onUpscale: (node: CanvasNodeData) => void;
    onAngle: (node: CanvasNodeData) => void;
    onOutpaint: (node: CanvasNodeData) => void;
    onLighting: (node: CanvasNodeData) => void;
    onCutout: (node: CanvasNodeData) => void;
    onPanorama720: (node: CanvasNodeData) => void;
    onViewImage: (node: CanvasNodeData) => void;
    onReversePrompt: (node: CanvasNodeData) => void;
    onAnalyzeVideo: (node: CanvasNodeData) => void;
    onTrimVideo: (node: CanvasNodeData) => void;
    onRetry: (node: CanvasNodeData) => void;
    onOpenStudio: (node: CanvasNodeData) => void;
    onScriptAction: (node: CanvasNodeData, intent: CanvasNodeActionIntent) => void;
    onToggleFreeResize: (node: CanvasNodeData) => void;
    onQuickStoryboard: (node: CanvasNodeData, command: CanvasSlashCommand) => void;
    onQuickImageCommand: (node: CanvasNodeData, command: CanvasImageQuickCommand) => void;
    onDelete: (node: CanvasNodeData) => void;
};

type ToolbarTool = {
    id: string;
    title: string;
    label: string;
    icon: ReactNode;
    onClick: () => void;
    active?: boolean;
    danger?: boolean;
};

export function CanvasNodeHoverToolbar({
    node,
    viewport,
    onKeep,
    onLeave,
    onInfo,
    onEditText,
    onDecreaseFont,
    onIncreaseFont,
    onToggleDialog,
    onUpload,
    onMarkPanorama360,
    onDownload,
    onSaveAsset,
    onMaskEdit,
    onCrop,
    onSplit,
    onUpscale,
    onAngle,
    onOutpaint,
    onLighting,
    onCutout,
    onPanorama720,
    onViewImage,
    onReversePrompt,
    onAnalyzeVideo,
    onTrimVideo,
    onRetry,
    onOpenStudio,
    onScriptAction,
    onToggleFreeResize,
    onQuickStoryboard,
    onQuickImageCommand,
    onDelete,
}: CanvasNodeHoverToolbarProps) {
    const [quickImageToolIds, setQuickImageToolIds] = useState<ImageQuickToolId[]>(defaultImageQuickToolIds);
    const [showImageToolLabels, setShowImageToolLabels] = useState(true);
    const [draftImageToolIds, setDraftImageToolIds] = useState<ImageQuickToolId[]>(defaultImageQuickToolIds);
    const [draftShowImageToolLabels, setDraftShowImageToolLabels] = useState(true);
    const [imageToolSettingsOpen, setImageToolSettingsOpen] = useState(false);
    const [storyboardMenuOpen, setStoryboardMenuOpen] = useState(false);
    const { message } = App.useApp();
    const copyText = useCopyText();
    const colorTheme = useThemeStore((state) => state.theme);
    const theme = canvasThemes[colorTheme];

    useEffect(() => {
        try {
            const stored = window.localStorage.getItem(IMAGE_QUICK_TOOLS_STORAGE_KEY);
            if (!stored) return;
            const parsed = JSON.parse(stored) as unknown;
            const config = readImageQuickToolsConfig(parsed);
            setQuickImageToolIds(config.ids);
            setShowImageToolLabels(config.showLabels);
        } catch {
            window.localStorage.removeItem(IMAGE_QUICK_TOOLS_STORAGE_KEY);
        }
    }, []);

    useEffect(() => {
        setImageToolSettingsOpen(false);
    }, [node?.id]);

    if (!node) return null;
    const currentNode = node;

    const left = viewport.x + (currentNode.position.x + currentNode.width / 2) * viewport.k;
    const top = viewport.y + currentNode.position.y * viewport.k - 30;
    const isImage = currentNode.type === CanvasNodeType.Image;
    const isVideo = currentNode.type === CanvasNodeType.Video;
    const isAudio = currentNode.type === CanvasNodeType.Audio;
    const hasStoredMedia = Boolean(currentNode.metadata?.content || currentNode.metadata?.storageKey);
    const hasImage = isImage && hasStoredMedia;
    const hasVideo = isVideo && hasStoredMedia;
    const hasAudio = isAudio && hasStoredMedia;
    const isText = currentNode.type === CanvasNodeType.Text;
    const isConfig = currentNode.type === CanvasNodeType.Config;
    const isComfyUi = currentNode.type === CanvasNodeType.ComfyUI;
    const isScriptTool = currentNode.metadata?.canvasTool === "script";
    const isDirectorTool = currentNode.metadata?.canvasTool === "director";
    const isLapianTool = currentNode.metadata?.canvasTool === "lapian";
    const canOpenDialog = isText || hasImage || isVideo;
    const canRetry = currentNode.metadata?.status === "error";
    const quickImageToolIdSet = new Set(quickImageToolIds);
    const copyImagePrompt = (target: CanvasNodeData) => {
        const prompt = target.metadata?.prompt?.trim();
        if (!prompt) {
            message.warning("暂无可复制的提示词");
            return;
        }
        copyText(prompt, "提示词已复制");
    };
    const imageTools = buildImageToolbarTools(currentNode, { onUpload, onMarkPanorama360, onToggleFreeResize, onMaskEdit, onCrop, onSplit, onUpscale, onAngle, onOutpaint, onLighting, onCutout, onPanorama720, onViewImage, onCopyPrompt: copyImagePrompt, onReversePrompt });

    function openImageToolSettings() {
        onKeep(currentNode.id);
        setDraftImageToolIds(quickImageToolIds);
        setDraftShowImageToolLabels(showImageToolLabels);
        setImageToolSettingsOpen(true);
    }

    const baseToolbarTools: ToolbarTool[] = [
        { id: "info", title: "查看节点信息", label: "信息", icon: <Info className="size-4" />, onClick: () => onInfo(node) },
        { id: "delete", title: "移除节点", label: "删除", icon: <Trash2 className="size-4" />, onClick: () => onDelete(node), danger: true },
    ];
    const nodeToolbarTools: ToolbarTool[] = [
        ...(canRetry ? [{ id: "retry", title: "重新生成", label: "重试", icon: <RefreshCw className="size-4" />, onClick: () => onRetry(node) }] : []),
        // 视频节点：对齐 LibTV 已生成视频动作条，剪辑/逐帧拉片前置（LibTV 的片段重拍/智能续写/去字幕/音频分离暂无对应能力，不摆空入口）
        // 拉片节点自身不显示剪辑/拉片/编辑对话，只保留上传替换与素材/下载
        ...(hasVideo && !isLapianTool ? [{ id: "trimVideo", title: "剪辑视频（设置入点/出点导出片段）", label: "剪辑", icon: <Scissors className="size-4" />, onClick: () => onTrimVideo(currentNode) }] : []),
        ...(hasVideo && !isLapianTool ? [{ id: "analyzeVideo", title: "逐帧拉片：解析视频为分镜表（抽帧 + 识图模型）", label: "拉片", icon: <ScanSearch className="size-4" />, onClick: () => onAnalyzeVideo(currentNode) }] : []),
        // 脚本/导演台节点：对齐 LibTV 脚本浮动工具栏（打开工作台/批量生成分镜/批量生视频）
        ...(isScriptTool
            ? [
                  { id: "openStudio", title: "打开脚本工作台", label: "工作台", icon: <Clapperboard className="size-4" />, onClick: () => onOpenStudio(currentNode) },
                  { id: "scriptStoryboard", title: "批量生成分镜", label: "生成分镜", icon: <LayoutGrid className="size-4" />, onClick: () => onScriptAction(currentNode, "script-to-storyboard") },
                  { id: "scriptVideo", title: "批量生视频", label: "生成视频", icon: <Video className="size-4" />, onClick: () => onScriptAction(currentNode, "script-to-video") },
              ]
            : []),
        ...(isDirectorTool ? [{ id: "openStudio", title: "打开导演台", label: "导演台", icon: <Clapperboard className="size-4" />, onClick: () => onOpenStudio(currentNode) }] : []),
        ...(hasImage || hasVideo || (isText && !isScriptTool) ? [{ id: "saveAsset", title: "加入我的素材", label: "存素材", icon: <FolderPlus className="size-4" />, onClick: () => onSaveAsset(node) }] : []),
        ...(hasImage || hasVideo || hasAudio ? [{ id: "download", title: hasAudio ? "下载音频" : hasVideo ? "下载视频" : "下载图片", label: "下载", icon: <Download className="size-4" />, onClick: () => onDownload(node) }] : []),
        ...(canOpenDialog && !isScriptTool && !isLapianTool ? [{ id: "edit", title: "编辑", label: "编辑", icon: <MessageSquare className="size-4" />, onClick: () => onToggleDialog(node) }] : []),
        ...(isText && !isScriptTool ? [{ id: "editText", title: "编辑文本", label: "编辑文字", icon: <Pencil className="size-4" />, onClick: () => onEditText(node) }] : []),
        ...(isText && !isScriptTool ? [{ id: "quickStoryboard", title: "快捷分镜", label: "快捷分镜", icon: <LayoutGrid className="size-4" />, onClick: () => { onKeep(currentNode.id); setStoryboardMenuOpen((value) => !value); } }] : []),
        ...(isConfig ? [{ id: "config", title: "打开生成配置", label: "配置", icon: <Settings2 className="size-4" />, onClick: () => onToggleDialog(node) }] : []),
        ...(isComfyUi && !isDirectorTool ? [{ id: "comfyui", title: "打开 ComfyUI", label: "ComfyUI", icon: <Workflow className="size-4" />, onClick: () => onToggleDialog(node) }] : []),
        ...(isText && !isScriptTool ? [{ id: "decreaseFont", title: "减小字号", label: "缩小", icon: <Minus className="size-4" />, onClick: () => onDecreaseFont(node) }] : []),
        ...(isText && !isScriptTool ? [{ id: "increaseFont", title: "增大字号", label: "放大", icon: <Plus className="size-4" />, onClick: () => onIncreaseFont(node) }] : []),
        ...(isImage && !hasImage ? [{ id: "uploadImage", title: "上传图片", label: "上传图片", icon: <Upload className="size-4" />, onClick: () => onUpload(node) }] : []),
        ...(isVideo ? [{ id: "uploadVideo", title: hasVideo ? "替换视频" : "上传视频", label: hasVideo ? "替换视频" : "上传视频", icon: <Video className="size-4" />, onClick: () => onUpload(node) }] : []),
        ...(isAudio ? [{ id: "uploadAudio", title: hasAudio ? "替换音频" : "上传音频", label: hasAudio ? "替换音频" : "上传音频", icon: <Music2 className="size-4" />, onClick: () => onUpload(node) }] : []),
        ...(hasImage ? imageTools.map((tool) => ({ id: tool.id, title: tool.title, label: tool.label, icon: tool.icon, active: tool.active, onClick: tool.onClick })) : []),
    ];
    const toolbarTools = hasImage ? [...nodeToolbarTools, ...baseToolbarTools].filter((tool) => quickImageToolIdSet.has(tool.id as ImageQuickToolId)) : [...nodeToolbarTools, ...baseToolbarTools];
    const selectableImageToolbarTools = [...baseToolbarTools, ...nodeToolbarTools].filter((tool) => tool.id !== "retry") as ImageToolbarSettingsTool[];

    const closeImageToolSettings = () => {
        setImageToolSettingsOpen(false);
        onLeave();
    };

    const setDraftImageToolVisible = (id: ImageQuickToolId, visible: boolean) => {
        setDraftImageToolIds((current) => {
            const selected = new Set(current);
            if (visible) selected.add(id);
            else selected.delete(id);
            return selectableImageToolbarTools.filter((tool) => selected.has(tool.id)).map((tool) => tool.id);
        });
    };

    const saveImageToolSettings = () => {
        const config = { ids: draftImageToolIds, showLabels: draftShowImageToolLabels };
        setQuickImageToolIds(config.ids);
        setShowImageToolLabels(config.showLabels);
        window.localStorage.setItem(IMAGE_QUICK_TOOLS_STORAGE_KEY, JSON.stringify(config));
        closeImageToolSettings();
    };

    return (
        <>
            <div
                className="canvas-node-action-toolbar absolute z-[70] flex h-11 -translate-x-1/2 -translate-y-full items-center overflow-visible rounded-xl border text-sm shadow-[0_14px_34px_rgba(0,0,0,.24)] backdrop-blur-xl"
                style={{ left, top, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                onPointerEnter={() => onKeep(node.id)}
                onPointerLeave={() => {
                    if (!imageToolSettingsOpen) onLeave();
                }}
                onPointerDown={(event) => event.stopPropagation()}
            >
                <span className="pointer-events-auto absolute inset-x-0 top-full h-8" aria-hidden />
                {toolbarTools.map((tool) => (
                    <ToolbarAction key={tool.id} {...tool} showLabel={showImageToolLabels} />
                ))}
                {hasImage ? <ToolbarAction id="more" title="配置快捷工具" label="更多" icon={<Ellipsis className="size-4" />} active={imageToolSettingsOpen} onClick={openImageToolSettings} showLabel={showImageToolLabels} /> : null}
                {hasImage ? (
                    <ToolbarAction
                        id="quickImageCommand"
                        title="快捷功能：以当前图为参考生成"
                        label="快捷功能"
                        icon={<Sparkles className="size-4" />}
                        active={storyboardMenuOpen}
                        onClick={() => {
                            onKeep(currentNode.id);
                            setStoryboardMenuOpen((value) => !value);
                        }}
                        showLabel={showImageToolLabels}
                    />
                ) : null}
                {storyboardMenuOpen ? (
                    <div
                        className="absolute left-1/2 top-full z-[80] mt-2 w-56 -translate-x-1/2 rounded-xl border p-1.5 shadow-[0_14px_34px_rgba(0,0,0,.28)] backdrop-blur-xl"
                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                        onPointerEnter={() => onKeep(currentNode.id)}
                        onPointerLeave={() => setStoryboardMenuOpen(false)}
                        onPointerDown={(event) => event.stopPropagation()}
                    >
                        {isText || currentNode.metadata?.canvasTool === "script" ? (
                            <>
                                <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium opacity-50">快捷分镜 · 按宫格生成</div>
                                {CANVAS_SLASH_COMMANDS.map((command) => (
                                    <button
                                        key={command.id}
                                        type="button"
                                        className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition hover:bg-black/5 dark:hover:bg-white/10"
                                        style={{ color: theme.node.text }}
                                        onClick={() => {
                                            setStoryboardMenuOpen(false);
                                            onQuickStoryboard(currentNode, command);
                                        }}
                                    >
                                        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/10 text-[10px] font-bold">
                                            {command.cols}×{command.rows}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block font-medium">{command.label}</span>
                                            <span className="block truncate opacity-65">{command.description}</span>
                                        </span>
                                    </button>
                                ))}
                            </>
                        ) : null}
                        {hasImage ? (
                            <>
                                <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium opacity-50">快捷功能 · 以当前图为参考</div>
                                {CANVAS_IMAGE_QUICK_COMMANDS.map((command) => (
                                    <button
                                        key={command.id}
                                        type="button"
                                        className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition hover:bg-black/5 dark:hover:bg-white/10"
                                        style={{ color: theme.node.text }}
                                        onClick={() => {
                                            setStoryboardMenuOpen(false);
                                            onQuickImageCommand(currentNode, command);
                                        }}
                                    >
                                        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/10 text-[11px] font-bold">{command.label.slice(0, 1)}</span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block font-medium">{command.label}</span>
                                            <span className="block truncate opacity-65">{command.description}</span>
                                        </span>
                                    </button>
                                ))}
                            </>
                        ) : null}
                    </div>
                ) : null}
            </div>
            {hasImage ? (
                <ImageToolSettingsModal
                    open={imageToolSettingsOpen}
                    tools={selectableImageToolbarTools}
                    selectedIds={draftImageToolIds}
                    showLabels={draftShowImageToolLabels}
                    onToggle={setDraftImageToolVisible}
                    onShowLabelsChange={setDraftShowImageToolLabels}
                    onCancel={closeImageToolSettings}
                    onSave={saveImageToolSettings}
                />
            ) : null}
        </>
    );
}

export function CanvasNodeInfoModal({ node, open, onClose }: { node: CanvasNodeData | null; open: boolean; onClose: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [view, setView] = useState<"info" | "json">("info");
    const imageBytes = node?.type === CanvasNodeType.Image && node.metadata?.content ? getDataUrlByteSize(node.metadata.content) : 0;
    const batchCount = node?.type === CanvasNodeType.Image ? node.metadata?.batchChildIds?.length || 0 : 0;
    const json = useMemo(() => {
        if (!node) return "";
        return JSON.stringify(
            node,
            (key, value) => {
                if (key === "title") return undefined;
                if (key === "content" && typeof value === "string" && value.startsWith("data:image/")) {
                    return "[base64 image]";
                }
                return value;
            },
            2,
        );
    }, [node]);

    useEffect(() => {
        if (open) setView("info");
    }, [node?.id, open]);

    const title = (
        <div className="flex items-center justify-between gap-4 pr-12">
            <span>节点信息</span>
            <Segmented
                size="small"
                value={view}
                onChange={(value) => setView(value as "info" | "json")}
                options={[
                    { label: "信息", value: "info" },
                    { label: "JSON", value: "json" },
                ]}
            />
        </div>
    );

    return (
        <Modal className="canvas-node-info-modal" title={title} open={open && Boolean(node)} centered footer={null} onCancel={onClose}>
            {node ? (
                <div className="h-[56vh] min-h-[360px] text-sm">
                    {view === "info" ? (
                        <div className="thin-scrollbar h-full space-y-3 overflow-auto pr-1">
                            <InfoRow label="ID" value={node.id} />
                            <InfoRow label="类型" value={node.type === CanvasNodeType.Text ? "文本" : node.type === CanvasNodeType.Image ? "图片" : node.type === CanvasNodeType.Video ? "视频" : node.type === CanvasNodeType.Audio ? "音频" : node.type === CanvasNodeType.Config ? "生成配置" : node.type === CanvasNodeType.ComfyUI ? "ComfyUI" : "节点"} />
                            <InfoRow label="尺寸" value={`${Math.round(node.width)} x ${Math.round(node.height)}`} />
                            <InfoRow label="位置" value={`${Math.round(node.position.x)}, ${Math.round(node.position.y)}`} />
                            <InfoRow label="状态" value={node.metadata?.status || "idle"} />
                            {batchCount > 1 ? <InfoRow label="图片组" value={`${batchCount} 张`} /> : null}
                            {node.metadata?.prompt ? <InfoRow label="提示词" value={node.metadata.prompt} /> : null}
                            {imageBytes ? <InfoRow label="图片大小" value={formatBytes(imageBytes)} /> : null}
                            {node.metadata?.errorDetails ? (
                                <div className="rounded-lg border p-3 text-red-400" style={{ borderColor: theme.node.stroke }}>
                                    {node.metadata.errorDetails}
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <pre className="thin-scrollbar h-full overflow-auto rounded-lg border p-3 text-xs leading-5" style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text }}>
                            {json}
                        </pre>
                    )}
                </div>
            ) : null}
        </Modal>
    );
}

function ToolbarAction({ title, label, icon, onClick, showLabel, active = false, danger = false }: ToolbarTool & { showLabel: boolean }) {
    const hasText = showLabel && Boolean(label);
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    return (
        <Tooltip title={title} placement="top" mouseEnterDelay={0.2} color={theme.node.panel} styles={{ container: { color: theme.node.text, boxShadow: "0 8px 24px rgba(0,0,0,.24)", fontSize: 13, fontWeight: 500 } }}>
            <button type="button" className="canvas-node-action-item group relative flex h-11 items-center whitespace-nowrap px-1.5" style={{ color: danger ? theme.ui.danger : theme.node.text }} onClick={onClick} aria-label={title}>
                <span className={`flex h-8 items-center ${hasText ? "gap-2 px-2.5" : "justify-center px-2"} rounded-md transition group-hover:bg-black/5 dark:group-hover:bg-white/10`} style={{ background: active ? theme.toolbar.activeBg : undefined }}>
                    {icon}
                    {hasText ? <span>{label}</span> : null}
                </span>
            </button>
        </Tooltip>
    );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3">
            <span className="opacity-50">{label}</span>
            <span className="min-w-0 whitespace-pre-wrap break-words">{value}</span>
        </div>
    );
}
