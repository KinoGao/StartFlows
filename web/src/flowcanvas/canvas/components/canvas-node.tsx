"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChevronRight, Clapperboard, FileText, FolderOpen, Image as ImageIcon, Layers3, Link, List, ListOrdered, Maximize2, Music2, Pause, Play, RefreshCw, ScanSearch, Sparkles, Star, Upload, Video, Volume2, VolumeX, Workflow } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { formatBytes } from "@/flowcanvas/lib/image-utils";
import { cn } from "@/flowcanvas/lib/utils";
import { Badge } from "@/flowcanvas/components/ui/badge";
import { Button } from "@/flowcanvas/components/ui/button";
import { Card } from "@/flowcanvas/components/ui/card";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";
import { peekImageThumbnailUrl, resolveImageThumbnailUrl } from "@/flowcanvas/services/image-storage";
import { getMediaBlob, peekCachedMediaUrl, resolveMediaUrl } from "@/flowcanvas/services/file-storage";
import { CanvasResourceMentionTextarea } from "./canvas-resource-mention-textarea";
import { CanvasNodeType, type CanvasLapianDimension, type CanvasNodeActionIntent, type CanvasNodeData, type Position as CanvasPosition } from "../types";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";
import { getPinColor, getPinColorLabel, getPinColorValue } from "../utils/canvas-pin-utils";
import { useCanvasScaleRef } from "./canvas-scale-context";

type ResizeCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

type ResizeStartEvent = React.PointerEvent;

function isGenerationConfigNode(type: CanvasNodeType) {
    return type === CanvasNodeType.Config || type === CanvasNodeType.ComfyUI;
}

/** Lazy-resolve media URL from storageKey on mount.
 *  - If storageKey is present, resolve via IndexedDB (cached after first hit).
 *  - Sync-checks the in-memory cache to avoid showing stale blob URLs from previous sessions.
 *  - Only falls back to `content` when there is no storageKey (legacy data without upload). */
function useLazyMediaUrl(storageKey: string | undefined, content: string | undefined, type: "image" | "media"): string {
    const [url, setUrl] = useState<string>(() => {
        if (!storageKey) return content ?? "";
        const cached = type === "image" ? peekImageThumbnailUrl(storageKey) : peekCachedMediaUrl(storageKey);
        return cached ?? "";
    });

    useEffect(() => {
        if (!storageKey) {
            setUrl(content ?? "");
            return;
        }
        // 图片节点渲染用缩略图（原图仅用于预览/下载/工具参考）
        const resolve = type === "image" ? resolveImageThumbnailUrl : resolveMediaUrl;
        const peek = type === "image" ? peekImageThumbnailUrl : peekCachedMediaUrl;
        let cancelled = false;
        setUrl(peek(storageKey) ?? "");
        resolve(storageKey, content?.startsWith("blob:") ? "" : (content ?? ""))
            .then((resolved) => {
                if (!cancelled) setUrl(resolved);
            })
            .catch((error) => {
                if (!cancelled) {
                    setUrl("");
                    console.error("[canvas-media] resolve failed", { storageKey, error });
                }
            });
        return () => {
            cancelled = true;
        };
    }, [storageKey, content, type]);

    return url;
}

export type CanvasNodeProps = {
    data: CanvasNodeData;
    isSelected: boolean;
    isRelated: boolean;
    isFocusRelated: boolean;
    isConnectionTarget: boolean;
    connectionTargetSide?: "source" | "target" | null;
    editRequestNonce?: number;
    showPanel: boolean;
    showImageInfo: boolean;
    isOverview?: boolean;
    positioned?: boolean;
    editorManaged?: boolean;
    resourceLabel?: CanvasResourceReference;
    mentionReferences?: CanvasResourceReference[];
    inputCount?: number;
    outputCount?: number;
    renderPanel?: (node: CanvasNodeData) => ReactNode;
    renderNodeContent?: (node: CanvasNodeData) => ReactNode;
    batchCount?: number;
    batchExpanded?: boolean;
    batchClosing?: boolean;
    batchOpening?: boolean;
    batchRecovering?: boolean;
    batchMotion?: { x: number; y: number; index: number };
    onHoverStart: (nodeId: string) => void;
    onHoverEnd: (nodeId: string) => void;
    onConnectStart: (nodeId: string, handleType: "source" | "target") => void;
    onResize: (nodeId: string, width: number, height: number, position?: CanvasPosition) => void;
    onContentChange: (nodeId: string, content: string) => void;
    onTextFormatChange?: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onTitleChange: (nodeId: string, title: string) => void;
    onToggleBatch?: (nodeId: string) => void;
    onSetBatchPrimary?: (node: CanvasNodeData) => void;
    onOpenComposer?: (node: CanvasNodeData) => void;
    onNodeAction?: (node: CanvasNodeData, intent: CanvasNodeActionIntent) => void;
    onUpload?: (node: CanvasNodeData) => void;
    onRetry?: (node: CanvasNodeData) => void;
    onOpenAssetPicker?: (node: CanvasNodeData) => void;
    onCaptureVideoFrame?: (node: CanvasNodeData, dataUrl: string, kind: "first" | "current" | "last") => void | Promise<void>;
    onViewImage?: (node: CanvasNodeData) => void;
    onGroupAction?: (node: CanvasNodeData, action: "execute" | "storyboard" | "ungroup") => void;
    /** TapNow: 点击节点右侧 + 连接点，请求宿主创建下游节点并自动连线。 */
    onClickCreate?: (node: CanvasNodeData) => void;
    onContextMenu: (event: React.MouseEvent, nodeId: string) => void;
};

type NodeContentRendererProps = {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    isSelected: boolean;
    isEditingContent: boolean;
    textareaRef: React.RefObject<HTMLTextAreaElement | null>;
    isBatchRoot: boolean;
    batchCount: number;
    batchExpanded: boolean;
    batchOpening: boolean;
    batchRecovering: boolean;
    renderNodeContent?: (node: CanvasNodeData) => ReactNode;
    onContentChange: (nodeId: string, content: string) => void;
    onTextFormatChange?: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onStopEditing: () => void;
    mentionReferences: CanvasResourceReference[];
    onStartEditing?: () => void;
    onRetry?: (node: CanvasNodeData) => void;
    onOpenAssetPicker?: () => void;
    onCaptureVideoFrame?: (node: CanvasNodeData, dataUrl: string, kind: "first" | "current" | "last") => void | Promise<void>;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: () => void;
    onOpenComposer?: () => void;
    onNodeAction?: (intent: CanvasNodeActionIntent) => void;
    onUpload?: () => void;
    onGroupAction?: (node: CanvasNodeData, action: "execute" | "storyboard" | "ungroup") => void;
};

/** Custom memo comparator: skip function props (renderPanel, renderNodeContent, callbacks)
 *  that change reference every render. Compare data by identity + primitive/enum props. */
function canvasNodePropsEqual(prev: CanvasNodeProps, next: CanvasNodeProps) {
    if (prev.data !== next.data) return false;
    if (prev.isSelected !== next.isSelected) return false;
    if (prev.isRelated !== next.isRelated) return false;
    if (prev.isFocusRelated !== next.isFocusRelated) return false;
    if (prev.isConnectionTarget !== next.isConnectionTarget) return false;
    if (prev.connectionTargetSide !== next.connectionTargetSide) return false;
    if (prev.showPanel !== next.showPanel) return false;
    if (prev.showImageInfo !== next.showImageInfo) return false;
    if (prev.isOverview !== next.isOverview) return false;
    if (prev.positioned !== next.positioned) return false;
    if (prev.editorManaged !== next.editorManaged) return false;
    if (prev.editRequestNonce !== next.editRequestNonce) return false;
    if (prev.batchCount !== next.batchCount) return false;
    if (prev.batchExpanded !== next.batchExpanded) return false;
    if (prev.batchClosing !== next.batchClosing) return false;
    if (prev.batchOpening !== next.batchOpening) return false;
    if (prev.batchRecovering !== next.batchRecovering) return false;
    if (prev.batchMotion !== next.batchMotion) return false;
    if (prev.resourceLabel !== next.resourceLabel) return false;
    if (prev.mentionReferences !== next.mentionReferences) return false;
    if (prev.inputCount !== next.inputCount) return false;
    if (prev.outputCount !== next.outputCount) return false;
    return true;
}

export const CanvasNode = React.memo(function CanvasNode({
    data,
    isSelected,
    isRelated,
    isFocusRelated,
    isConnectionTarget,
    connectionTargetSide = null,
    editRequestNonce = 0,
    showPanel,
    showImageInfo,
    isOverview = false,
    positioned = true,
    editorManaged = false,
    resourceLabel,
    mentionReferences = [],
    inputCount = 0,
    outputCount = 0,
    renderPanel,
    renderNodeContent,
    batchCount = 0,
    batchExpanded = false,
    batchClosing = false,
    batchOpening = false,
    batchRecovering = false,
    batchMotion,
    onHoverStart,
    onHoverEnd,
    onConnectStart,
    onResize,
    onContentChange,
    onTextFormatChange,
    onTitleChange,
    onToggleBatch,
    onSetBatchPrimary,
    onOpenComposer,
    onNodeAction,
    onUpload,
    onRetry,
    onOpenAssetPicker,
    onCaptureVideoFrame,
    onViewImage,
    onGroupAction,
    onClickCreate,
    onContextMenu,
}: CanvasNodeProps) {
    const scaleRef = useCanvasScaleRef();
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [isEditingContent, setIsEditingContent] = useState(false);
    const hasImageContent = data.type === CanvasNodeType.Image && Boolean(data.metadata?.content || data.metadata?.storageKey);
    const hasVideoContent = data.type === CanvasNodeType.Video && Boolean(data.metadata?.content || data.metadata?.storageKey);
    const hasAudioContent = data.type === CanvasNodeType.Audio && Boolean(data.metadata?.content || data.metadata?.storageKey);
    const isMediaNode = data.type === CanvasNodeType.Image || data.type === CanvasNodeType.Video || data.type === CanvasNodeType.Audio;
    const isEmptyMediaNode = isMediaNode && !hasImageContent && !hasVideoContent && !hasAudioContent && data.metadata?.status !== "loading" && data.metadata?.status !== "error";
    const isGroup = data.type === CanvasNodeType.Group;
    const isBatchRoot = data.type === CanvasNodeType.Image && Boolean(data.metadata?.isBatchRoot) && batchCount > 1;
    const isBatchChild = data.type === CanvasNodeType.Image && Boolean(data.metadata?.batchRootId);
    const isActive = isConnectionTarget || isSelected || isFocusRelated;
    const imageBorderColor = isActive || (isRelated && !isBatchChild) ? theme.ui.accent : theme.ui.hairline;
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const nodeRef = useRef<HTMLDivElement>(null);
    const resizeFrameRef = useRef<number | null>(null);
    const resizeRef = useRef({
        isResizing: false,
        corner: "bottom-right" as ResizeCorner,
        startX: 0,
        startY: 0,
        startLeft: 0,
        startTop: 0,
        startWidth: 0,
        startHeight: 0,
        currentWidth: data.width,
        currentHeight: data.height,
        currentPosition: data.position,
        keepRatio: false,
        ratio: 1,
    });

    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        const handleWheel = (event: WheelEvent) => event.stopPropagation();
        textarea.addEventListener("wheel", handleWheel, { passive: false });
        return () => textarea.removeEventListener("wheel", handleWheel);
    }, [data.type, isEditingContent]);

    useEffect(() => {
        if (!showPanel) return;
        const panel = panelRef.current;
        if (!panel) return;
        const stopWheel = (event: WheelEvent) => event.stopPropagation();
        panel.addEventListener("wheel", stopWheel, { capture: true, passive: true });
        return () => panel.removeEventListener("wheel", stopWheel, true);
    }, [showPanel]);

    useEffect(() => {
        if (!isEditingContent) return;
        const textarea = textareaRef.current;
        textarea?.focus();
        textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
    }, [isEditingContent]);

    useEffect(() => {
        if (!editRequestNonce || data.type !== CanvasNodeType.Text) return;
        setIsEditingContent(true);
    }, [data.type, editRequestNonce]);

    useEffect(() => {
        if (!isEditingContent) return;

        const handleOutsidePointerDown = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (isEditingContent && textareaRef.current?.contains(target)) return;

            setIsEditingContent(false);
        };

        window.addEventListener("pointerdown", handleOutsidePointerDown, true);
        return () => window.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    }, [isEditingContent]);

    // Stable refs so resize callbacks never need to be removed/re-added when
    // data.type or positioned changes mid-drag.
    const handleResizeMoveRef = useRef<((event: PointerEvent) => void) | null>(null);
    const handleResizeUpRef = useRef<(() => void) | null>(null);

    const handleResizeMove = useCallback(
        (event: PointerEvent) => {
            if (!resizeRef.current.isResizing) return;

            const scale = Math.max(scaleRef.current, 0.05);
            const dx = (event.clientX - resizeRef.current.startX) / scale;
            const dy = (event.clientY - resizeRef.current.startY) / scale;
            const isMediaNode = data.type === CanvasNodeType.Image || data.type === CanvasNodeType.Video;
            const isGroup = data.type === CanvasNodeType.Group;
            const minWidth = data.type === CanvasNodeType.Image ? 120 : data.type === CanvasNodeType.Video ? 160 : isGroup ? 180 : 220;
            const minHeight = data.type === CanvasNodeType.Image ? 96 : data.type === CanvasNodeType.Video ? 96 : isGroup ? 120 : 160;
            const maxWidth = isGroup ? 4000 : isMediaNode ? 640 : data.type === CanvasNodeType.ComfyUI || data.type === CanvasNodeType.Config ? 720 : 520;
            const maxHeight = isGroup ? 3000 : data.type === CanvasNodeType.Image ? 640 : data.type === CanvasNodeType.Video ? 480 : data.type === CanvasNodeType.ComfyUI || data.type === CanvasNodeType.Config ? 640 : 480;
            const startRight = resizeRef.current.startLeft + resizeRef.current.startWidth;
            const startBottom = resizeRef.current.startTop + resizeRef.current.startHeight;
            const fromLeft = resizeRef.current.corner.includes("left");
            const fromTop = resizeRef.current.corner.includes("top");
            const rawWidth = Math.min(maxWidth, Math.max(minWidth, resizeRef.current.startWidth + (fromLeft ? -dx : dx)));
            const rawHeight = Math.min(maxHeight, Math.max(minHeight, resizeRef.current.startHeight + (fromTop ? -dy : dy)));
            let width = rawWidth;
            let height = rawHeight;
            if (resizeRef.current.keepRatio) {
                const ratio = resizeRef.current.ratio;
                if (Math.abs(dx) >= Math.abs(dy)) {
                    height = width / ratio;
                } else {
                    width = height * ratio;
                }
                if (height < minHeight) {
                    height = minHeight;
                    width = height * ratio;
                }
                if (width < minWidth) {
                    width = minWidth;
                    height = width / ratio;
                }
                const maxScale = Math.min(1, maxWidth / width, maxHeight / height);
                width *= maxScale;
                height *= maxScale;
            }

            const position = {
                x: fromLeft ? startRight - width : resizeRef.current.startLeft,
                y: fromTop ? startBottom - height : resizeRef.current.startTop,
            };
            resizeRef.current.currentWidth = width;
            resizeRef.current.currentHeight = height;
            resizeRef.current.currentPosition = position;
            if (resizeFrameRef.current) return;
            resizeFrameRef.current = requestAnimationFrame(() => {
                resizeFrameRef.current = null;
                const element = nodeRef.current;
                if (!element) return;
                element.style.width = `${resizeRef.current.currentWidth}px`;
                element.style.height = `${resizeRef.current.currentHeight}px`;
                if (positioned) element.style.transform = `translate(${resizeRef.current.currentPosition.x}px, ${resizeRef.current.currentPosition.y}px)`;
            });
        },
        [data.metadata?.freeResize, data.type, positioned, scaleRef],
    );
    handleResizeMoveRef.current = handleResizeMove;

    const handleResizeUp = useCallback(() => {
        if (!resizeRef.current.isResizing) return;
        resizeRef.current.isResizing = false;
        if (resizeFrameRef.current) {
            cancelAnimationFrame(resizeFrameRef.current);
            resizeFrameRef.current = null;
        }
        onResize(data.id, resizeRef.current.currentWidth, resizeRef.current.currentHeight, resizeRef.current.currentPosition);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        // Remove the same stable wrappers that were registered in handleResizeMouseDown.
        const r = resizeRef.current as typeof resizeRef.current & { _moveStable?: (e: PointerEvent) => void; _upStable?: () => void };
        if (r._moveStable) window.removeEventListener("pointermove", r._moveStable);
        if (r._upStable) {
            window.removeEventListener("pointerup", r._upStable);
            window.removeEventListener("pointercancel", r._upStable);
            window.removeEventListener("blur", r._upStable);
        }
    }, [data.id, onResize]);
    handleResizeUpRef.current = handleResizeUp;

    const handleResizeMouseDown = (event: ResizeStartEvent, corner: ResizeCorner) => {
        event.stopPropagation();
        event.preventDefault();
        resizeRef.current = {
            isResizing: true,
            corner,
            startX: event.clientX,
            startY: event.clientY,
            startLeft: data.position.x,
            startTop: data.position.y,
            startWidth: data.width,
            startHeight: data.height,
            currentWidth: data.width,
            currentHeight: data.height,
            currentPosition: data.position,
            keepRatio: (data.type === CanvasNodeType.Image && !data.metadata?.freeResize) || data.type === CanvasNodeType.Video,
            ratio: (data.metadata?.naturalWidth || data.width) / (data.metadata?.naturalHeight || data.height || 1),
        };
        document.body.style.cursor = corner.includes("left") === corner.includes("top") ? "nwse-resize" : "nesw-resize";
        document.body.style.userSelect = "none";
        const element = nodeRef.current;
        if (element) {
            element.style.width = `${data.width}px`;
            element.style.height = `${data.height}px`;
            if (positioned) element.style.transform = `translate(${data.position.x}px, ${data.position.y}px)`;
        }
        // Use stable wrapper functions that always delegate to the latest callback
        // via refs, so we never need to remove/re-add listeners when the callbacks
        // are recreated by useCallback.
        const moveStable = (e: PointerEvent) => handleResizeMoveRef.current?.(e);
        const upStable = () => handleResizeUpRef.current?.();
        // Store on resizeRef so the cleanup effect can remove the same references.
        (resizeRef.current as typeof resizeRef.current & { _moveStable?: typeof moveStable; _upStable?: typeof upStable })._moveStable = moveStable;
        (resizeRef.current as typeof resizeRef.current & { _moveStable?: typeof moveStable; _upStable?: typeof upStable })._upStable = upStable;
        window.addEventListener("pointermove", moveStable);
        window.addEventListener("pointerup", upStable);
        window.addEventListener("pointercancel", upStable);
        window.addEventListener("blur", upStable);
    };

    useEffect(() => {
        return () => {
            if (resizeFrameRef.current) cancelAnimationFrame(resizeFrameRef.current);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            const r = resizeRef.current as typeof resizeRef.current & { _moveStable?: (e: PointerEvent) => void; _upStable?: () => void };
            if (r._moveStable) window.removeEventListener("pointermove", r._moveStable);
            if (r._upStable) {
                window.removeEventListener("pointerup", r._upStable);
                window.removeEventListener("pointercancel", r._upStable);
                window.removeEventListener("blur", r._upStable);
            }
        };
    }, []);

    const shouldUseOverview = isOverview && !showPanel && !isEditingContent;
    const useLeaferOverviewContent =
        editorManaged
        && shouldUseOverview
        && !isSelected
        && (
            (data.type === CanvasNodeType.Text && Boolean(data.metadata?.content?.trim()))
            || data.type === CanvasNodeType.Config
            || data.type === CanvasNodeType.ComfyUI
        )
        && data.metadata?.status !== "loading"
        && data.metadata?.status !== "error";
    const panelWidthClass =
        data.metadata?.canvasTool === "director"
            ? "w-[920px] max-w-[calc(100vw-48px)]"
            : data.metadata?.canvasTool === "script"
              ? "w-[720px] max-w-[calc(100vw-48px)]"
              : "w-[500px] max-w-[calc(100vw-32px)]";

    return (
        <div
            ref={nodeRef}
            data-node-id={data.id}
            data-node-kind={data.type}
            data-leafer-overview={editorManaged && shouldUseOverview ? "true" : undefined}
            data-leafer-static-image={
                editorManaged
                && hasImageContent
                && !isBatchRoot
                && !isBatchChild
                && data.metadata?.canvasTool !== "panorama360"
                    ? "true"
                    : undefined
            }
            data-node-editing={isEditingContent ? "true" : undefined}
            data-node-selected={isSelected ? "true" : undefined}
            data-node-status={data.metadata?.status || "idle"}
            data-node-empty-media={isEmptyMediaNode ? "true" : undefined}
            data-node-batch-root={isBatchRoot ? "true" : undefined}
            data-node-batch-child={isBatchChild ? "true" : undefined}
            className={`node-element ${editorManaged ? "is-leafer-managed" : ""} ${positioned ? "absolute" : "relative"} flex select-none flex-col ${isGroup ? "z-0" : isSelected ? "z-50" : "z-10"}`}
            style={{
                transform: positioned ? `translate(${data.position.x}px, ${data.position.y}px)` : undefined,
                width: data.width,
                height: data.height,
                transition: editorManaged ? "opacity 160ms ease" : "box-shadow 160ms ease, opacity 160ms ease",
                contain: "layout style",
                // `auto` adds paint containment and clips the unselected node's
                // external magnetic port from hit-testing on the canvas.
                contentVisibility: "visible",
                containIntrinsicSize: `${data.width}px ${data.height}px`,
            }}
            onPointerEnter={() => {
                if (shouldUseOverview) return;
                onHoverStart(data.id);
            }}
            onPointerLeave={() => {
                if (shouldUseOverview) return;
                onHoverEnd(data.id);
            }}
            onContextMenu={(event) => onContextMenu(event, data.id)}
        >
            <Card
                className="creative-os-node canvas-node-card relative h-full w-full overflow-visible border bg-transparent p-0 py-0 text-sm ring-0"
                style={{
                    background: editorManaged ? "transparent" : isGroup ? theme.ui.controlFill : !hasImageContent && !hasVideoContent ? theme.node.panel : "rgba(14,14,14,.45)",
                    borderColor: editorManaged ? "transparent" : isGroup
                        ? isSelected
                            ? theme.ui.accent
                            : theme.ui.hairline
                        : hasImageContent
                            ? imageBorderColor
                            : isActive
                              ? theme.ui.accent
                              : isRelated
                                ? theme.ui.accent
                                : theme.ui.hairline,
                    boxShadow: editorManaged ? undefined : isGroup ? (isSelected ? `0 0 0 2px ${theme.ui.accentSoft}` : undefined) : isActive ? `0 0 0 2px ${theme.ui.accent}, ${theme.ui.shadow}` : undefined,
                }}
                onDoubleClick={(event) => {
                    if (data.type === CanvasNodeType.Image && hasImageContent) return;
                    if (isBatchRoot) {
                        event.stopPropagation();
                        onToggleBatch?.(data.id);
                        return;
                    }
                    if (data.metadata?.canvasTool === "script") {
                        event.stopPropagation();
                        onOpenComposer?.(data);
                        return;
                    }
                    if (data.type !== CanvasNodeType.Text) return;
                    event.stopPropagation();
                    setIsEditingContent(true);
                }}
            >
                <div
                    className={`canvas-node-render-surface relative flex h-full w-full items-center justify-center ${isBatchRoot ? "overflow-visible" : "overflow-hidden"}`}
                    style={
                        {
                            background: editorManaged ? "transparent" : !hasImageContent && !hasVideoContent ? theme.node.panel : "transparent",
                            "--batch-from-x": `${batchMotion?.x || 0}px`,
                            "--batch-from-y": `${batchMotion?.y || 0}px`,
                            "--batch-from-rotate": `${6 + (batchMotion?.index || 0) * 4}deg`,
                            animation: data.metadata?.batchRootId ? (batchClosing ? "canvas-batch-child-out 260ms cubic-bezier(.4,0,.2,1) both" : "canvas-batch-child-in 340ms cubic-bezier(.2,.85,.18,1) both") : undefined,
                            animationDelay: data.metadata?.batchRootId ? `${batchClosing ? 0 : 45 + (batchMotion?.index || 0) * 24}ms` : undefined,
                        } as React.CSSProperties
                    }
                >
                    {useLeaferOverviewContent ? null : <NodeContent
                    node={data}
                    theme={theme}
                    isSelected={isSelected}
                    isEditingContent={isEditingContent}
                    textareaRef={textareaRef}
                    isBatchRoot={isBatchRoot}
                    batchCount={batchCount}
                    batchExpanded={batchExpanded}
                    batchOpening={batchOpening}
                    batchRecovering={batchRecovering}
                    renderNodeContent={renderNodeContent}
                    mentionReferences={mentionReferences}
                    onStartEditing={() => setIsEditingContent(true)}
                    onContentChange={onContentChange}
                    onTextFormatChange={onTextFormatChange}
                    onStopEditing={() => setIsEditingContent(false)}
                    onRetry={onRetry}
                    onOpenAssetPicker={() => onOpenAssetPicker?.(data)}
                    onCaptureVideoFrame={onCaptureVideoFrame}
                    onOpenComposer={() => onOpenComposer?.(data)}
                    onNodeAction={(intent) => onNodeAction?.(data, intent)}
                    onUpload={() => onUpload?.(data)}
                    onToggleBatch={() => onToggleBatch?.(data.id)}
                    onSetBatchPrimary={() => onSetBatchPrimary?.(data)}
                    onGroupAction={onGroupAction}
                    />}
                </div>

                {!isGroup && !shouldUseOverview ? <NodeTitleBadge node={data} theme={theme} inputCount={inputCount} outputCount={outputCount} onTitleChange={onTitleChange} /> : null}
                {isGroup ? <GroupTitleEditor node={data} theme={theme} onTitleChange={onTitleChange} /> : null}
                {!shouldUseOverview && !isGroup ? <NodePinIndicator node={data} theme={theme} /> : null}
                {!shouldUseOverview && resourceLabel ? <ResourceLabelBadge reference={resourceLabel} /> : null}

                {!shouldUseOverview && data.type === CanvasNodeType.Text && isSelected ? (
                    <TextFormatToolbar
                        node={data}
                        theme={theme}
                        onChange={(patch) => onTextFormatChange?.(data.id, patch)}
                    />
                ) : null}

                {!shouldUseOverview && !editorManaged ? (
                    <>
                        <ResizeHandle corner="top-left" visible={isSelected} onMouseDown={handleResizeMouseDown} />
                        <ResizeHandle corner="top-right" visible={isSelected} onMouseDown={handleResizeMouseDown} />
                        <ResizeHandle corner="bottom-left" visible={isSelected} onMouseDown={handleResizeMouseDown} />
                        <ResizeHandle corner="bottom-right" visible={isSelected} onMouseDown={handleResizeMouseDown} />
                    </>
                ) : null}
            </Card>

            {!shouldUseOverview && isSelected && isEmptyMediaNode ? (
                <MediaNodeQuickActions
                    kind={data.type as CanvasNodeType.Image | CanvasNodeType.Video | CanvasNodeType.Audio}
                    theme={theme}
                    onUpload={() => onUpload?.(data)}
                    onOpenAssetPicker={data.type === CanvasNodeType.Image ? () => onOpenAssetPicker?.(data) : undefined}
                />
            ) : null}

            {/* 拉线时只显示当前吸附目标的圆球（active），不再把所有节点的端口全部点亮；
                未参与连线的节点保持 hover 磁吸区才显示。 */}
            {!isGroup ? <ConnectionHandleDot side="left" visible={isSelected} active={isConnectionTarget && connectionTargetSide === "target"} /> : null}
            {!isGroup && !isGenerationConfigNode(data.type) ? <ConnectionHandleDot side="right" visible={isSelected} active={isConnectionTarget && connectionTargetSide === "source"} onClickCreate={onClickCreate ? () => onClickCreate(data) : undefined} /> : null}

            {showPanel && renderPanel ? (
                <div
                    ref={panelRef}
                    className={cn("absolute left-1/2 top-full z-[70] max-h-[68vh] -translate-x-1/2 overflow-x-hidden overflow-y-auto pt-4 thin-scrollbar", panelWidthClass)}
                    onWheel={(event) => {
                        if (event.ctrlKey || event.metaKey) return; // Ctrl+滚轮放行给画布缩放
                        const el = event.currentTarget;
                        if (el.scrollHeight <= el.clientHeight) return; // no overflow → let canvas scroll
                        const atTop = el.scrollTop === 0;
                        const atBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 1;
                        if ((event.deltaY < 0 && atTop) || (event.deltaY > 0 && atBottom)) return; // at boundary → let canvas scroll
                        event.stopPropagation();
                    }}
                >
                    {renderPanel(data)}
                </div>
            ) : null}
        </div>
    );
}, canvasNodePropsEqual);

function NodeContent(props: NodeContentRendererProps): React.ReactElement {
    if (props.node.type === CanvasNodeType.Group) return <GroupContent {...props} />;
    if (props.node.metadata?.canvasTool === "videoComposition") return <VideoCompositionContent {...props} />;
    if (props.node.metadata?.canvasTool === "director") return <DirectorContent {...props} />;
    if (props.node.metadata?.canvasTool === "script") return <ScriptNodeContent {...props} />;
    if (props.node.metadata?.canvasTool === "lapian") return <LapianContent {...props} />;
    if (props.node.type === CanvasNodeType.Config && props.renderNodeContent) return <>{props.renderNodeContent(props.node)}</>;
    if (props.isBatchRoot) return <ImageNodeContent {...props} />;
    if (props.node.metadata?.status === "loading") return <LoadingContent node={props.node} theme={props.theme} />;
    if (props.node.metadata?.status === "error") return <ErrorContent node={props.node} theme={props.theme} onRetry={props.onRetry} />;

    const Renderer = nodeContentRenderers[props.node.type] ?? UnknownNodeContent;
    return <>{Renderer(props)}</>;
}

const nodeContentRenderers = {
    [CanvasNodeType.Text]: TextContent,
    [CanvasNodeType.Image]: ImageNodeContent,
    [CanvasNodeType.Config]: EmptyImageContent,
    [CanvasNodeType.ComfyUI]: ComfyUiContent,
    [CanvasNodeType.Video]: VideoNodeContent,
    [CanvasNodeType.Audio]: AudioNodeContent,
    [CanvasNodeType.Group]: GroupContent,
} satisfies Record<CanvasNodeType, (props: NodeContentRendererProps) => ReactNode>;

function GroupContent({ node, isSelected, onGroupAction }: NodeContentRendererProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isStoryboard = node.metadata?.groupVariant === "storyboard";
    const actions: Array<{ key: "execute" | "storyboard" | "ungroup"; label: string; disabled?: boolean }> = [
        { key: "execute", label: "整组执行" },
        { key: "storyboard", label: isStoryboard ? "已设为分镜组" : "设为分镜组", disabled: isStoryboard },
        { key: "ungroup", label: "解散组" },
    ];

    return (
        <div className="relative h-full w-full rounded-[inherit]">
            {isSelected ? (
                <div
                    data-canvas-no-zoom
                    className="pointer-events-auto absolute left-2 top-2 z-[60] flex max-w-[calc(100vw-40px)] items-center gap-1 rounded-lg border px-1.5 py-1 text-xs shadow-[0_10px_30px_rgba(0,0,0,.28)] backdrop-blur"
                    style={{ background: theme.ui.materialElevated, color: theme.node.text, borderColor: theme.ui.hairline }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => event.stopPropagation()}
                >
                    {actions.map((action) => (
                        <button
                            key={action.key}
                            type="button"
                            disabled={action.disabled}
                            className="h-7 whitespace-nowrap rounded-md px-2 transition hover:opacity-75 disabled:cursor-default disabled:opacity-45"
                            onClick={(event) => {
                                event.stopPropagation();
                                onGroupAction?.(node, action.key);
                            }}
                            onMouseDown={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                        >
                            {action.label}
                        </button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function LoadingContent({ node, theme }: Pick<NodeContentRendererProps, "node" | "theme">) {
    const downloading = node.metadata?.videoDownloading === true;
    return (
        <div
            role="status"
            aria-label="生成中"
            className="canvas-generation-loading relative h-full w-full overflow-hidden rounded-[inherit]"
            style={
                {
                    "--canvas-generation-base": theme.canvas.background,
                    "--canvas-generation-glow": theme.node.text,
                    "--canvas-generation-dot": theme.node.placeholder,
                } as React.CSSProperties
            }
        >
            <div aria-hidden className="canvas-generation-loading-dots absolute inset-0" />
            <div aria-hidden className="canvas-generation-loading-dot-mask absolute inset-0" />
            <div aria-hidden className="canvas-generation-loading-shimmer absolute inset-0" />
            <div className="relative z-10 flex h-full w-full flex-col items-center justify-center gap-1 px-4 text-center" style={{ color: theme.node.text }}>
                <span className="text-xs font-medium tracking-wide">{downloading ? "视频已生成，正在下载" : "任务运行中"}</span>
                {node.metadata?.generationJobId ? <span className="text-[10px] opacity-60">下载可能需要几分钟，请耐心等待</span> : null}
            </div>
        </div>
    );
}

function ErrorContent({ node, theme, onRetry }: Pick<NodeContentRendererProps, "node" | "theme" | "onRetry">) {
    return (
        <div className="canvas-node-error-state flex max-w-[260px] flex-col items-center gap-3 px-5 text-center">
            <div className="text-xs leading-5 text-red-300">{node.metadata?.errorDetails || "生成失败"}</div>
            <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-full border px-3 text-xs transition hover:scale-[1.02]"
                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                onClick={(event) => {
                    event.stopPropagation();
                    onRetry?.(node);
                }}
                onMouseDown={(event) => event.stopPropagation()}
            >
                <RefreshCw className="size-3.5" />
                重试
            </Button>
        </div>
    );
}

function UnknownNodeContent({ theme }: Pick<NodeContentRendererProps, "theme">) {
    return <EmptyState icon={<FileText className="size-6 opacity-35" />} label="未知节点" theme={theme} />;
}

function EmptyState({ icon, label, theme }: { icon: ReactNode; label: string; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2.5" style={{ color: theme.node.placeholder }}>
            <div className="flex size-11 items-center justify-center rounded-lg border" style={{ background: theme.toolbar.activeBg, borderColor: `${theme.node.stroke}88` }}>
                {icon}
            </div>
            <Badge variant="outline" className="h-auto rounded-md border px-2 py-1 text-[10px] opacity-60" style={{ borderColor: `${theme.node.stroke}88`, color: theme.node.placeholder }}>
                {label}
            </Badge>
        </div>
    );
}

function TextFormatToolbar({ node, theme, onChange }: { node: CanvasNodeData; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onChange?: (patch: Partial<CanvasNodeData["metadata"]>) => void }) {
    const format = node.metadata?.textFormat || {};
    const update = (patch: NonNullable<CanvasNodeData["metadata"]>["textFormat"]) => onChange?.({ textFormat: { ...format, ...patch } });
    const clear = () => onChange?.({ textFormat: undefined, fontSize: 14 });
    const buttons = [
        { label: "H1", title: "标题 1", active: format.heading === 1, onClick: () => update({ heading: format.heading === 1 ? undefined : 1, quote: undefined }) },
        { label: "H2", title: "标题 2", active: format.heading === 2, onClick: () => update({ heading: format.heading === 2 ? undefined : 2, quote: undefined }) },
        { label: "H3", title: "标题 3", active: format.heading === 3, onClick: () => update({ heading: format.heading === 3 ? undefined : 3, quote: undefined }) },
        { label: "❝", title: "引用", active: Boolean(format.quote), onClick: () => update({ quote: !format.quote, heading: undefined }) },
        { label: "B", title: "粗体", active: Boolean(format.bold), onClick: () => update({ bold: !format.bold }) },
        { label: "I", title: "斜体", active: Boolean(format.italic), onClick: () => update({ italic: !format.italic }) },
        { label: "U", title: "下划线", active: Boolean(format.underline), onClick: () => update({ underline: !format.underline }) },
        { label: "S", title: "删除线", active: Boolean(format.strike), onClick: () => update({ strike: !format.strike }) },
        { label: <List className="size-3.5" />, title: "无序列表", active: format.list === "unordered", onClick: () => update({ list: format.list === "unordered" ? undefined : "unordered" }) },
        { label: <ListOrdered className="size-3.5" />, title: "有序列表", active: format.list === "ordered", onClick: () => update({ list: format.list === "ordered" ? undefined : "ordered" }) },
        { label: <Link className="size-3.5" />, title: "链接样式", active: Boolean(format.link), onClick: () => update({ link: !format.link }) },
    ];

    return (
        <div
            className="canvas-text-format-toolbar pointer-events-auto absolute bottom-[calc(100%+34px)] left-1/2 z-[65] flex max-w-[min(680px,calc(100vw-40px))] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-xl border p-1.5 shadow-[0_14px_34px_rgba(0,0,0,.28)] backdrop-blur-xl"
            style={{ background: `${theme.toolbar.panel}e8`, borderColor: theme.ui.hairline, color: theme.node.text }}
            data-canvas-no-zoom
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {buttons.map((button) => (
                <button
                    key={button.title}
                    type="button"
                    title={button.title}
                    aria-label={button.title}
                    className="grid size-7 shrink-0 place-items-center rounded text-[11px] font-semibold transition"
                    style={{ background: button.active ? theme.toolbar.activeBg : "transparent", color: button.active ? theme.ui.accent : theme.node.text }}
                    onClick={(event) => {
                        event.stopPropagation();
                        button.onClick();
                    }}
                >
                    {button.label}
                </button>
            ))}
            <button
                type="button"
                title="清除格式"
                aria-label="清除格式"
                className="grid size-7 shrink-0 place-items-center rounded text-[11px] opacity-60 transition hover:opacity-100"
                onClick={(event) => {
                    event.stopPropagation();
                    clear();
                }}
            >
                ↺
            </button>
        </div>
    );
}

function TextContent({ node, theme, isEditingContent, textareaRef, mentionReferences, onContentChange, onStopEditing, onStartEditing, onNodeAction }: NodeContentRendererProps) {
    const format = node.metadata?.textFormat || {};
    const fontSize = format.heading === 1 ? 24 : format.heading === 2 ? 20 : format.heading === 3 ? 17 : node.metadata?.fontSize || 14;
    const textStyle = {
        fontSize: `${fontSize}px`,
        lineHeight: `${Math.round(fontSize * (format.quote ? 1.6 : 1.72))}px`,
        letterSpacing: 0,
        color: format.link ? theme.ui.accent : theme.node.text,
        boxSizing: "border-box",
        fontWeight: format.bold ? 700 : format.heading ? 650 : 400,
        fontStyle: format.italic ? "italic" : "normal",
        textDecoration: format.link ? "underline" : [format.underline ? "underline" : "", format.strike ? "line-through" : ""].filter(Boolean).join(" ") || "none",
        borderLeft: format.quote ? `3px solid ${theme.ui.accent}` : undefined,
        paddingLeft: format.quote ? 14 : undefined,
    } as React.CSSProperties;
    const isEmpty = !node.metadata?.content?.trim();

    return (
        <div data-node-text-editable={isEditingContent ? "true" : undefined} className="flex h-full w-full flex-col overflow-hidden pt-8">
            {isEditingContent ? (
                <CanvasResourceMentionTextarea
                    ref={textareaRef}
                    className="nodrag nopan thin-scrollbar m-0 block h-full w-full resize-none appearance-none overflow-y-auto whitespace-pre-wrap break-words border-none bg-transparent px-5 pb-5 pt-0 outline-none select-text"
                    style={textStyle}
                    value={node.metadata?.content || ""}
                    references={mentionReferences}
                    highlightLabels={false}
                    onChange={(value) => onContentChange(node.id, value)}
                    onBlur={onStopEditing}
                    onKeyDown={(event) => {
                        if (event.key === "Escape") onStopEditing();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    onWheel={(event) => { if (!event.ctrlKey && !event.metaKey) event.stopPropagation(); }}
                />
            ) : isEmpty ? (
                <div className="canvas-node-text-empty flex h-full w-full items-start px-5 pt-3 text-[14px]" style={{ color: theme.node.placeholder }}>
                    双击开始编辑…
                </div>
            ) : (
                <div
                    className="thin-scrollbar block h-full w-full select-none overflow-y-auto whitespace-pre-wrap break-words bg-transparent px-5 pb-5 pt-0"
                    style={textStyle}
                    onDoubleClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onStartEditing?.();
                    }}
                    onWheel={(event) => { if (!event.ctrlKey && !event.metaKey) event.stopPropagation(); }}
                >
                    {format.list ? (
                        (node.metadata?.content || "").split("\n").map((line, index) => (
                            <div key={index} className="flex gap-1.5">
                                <span className="shrink-0 opacity-60">{format.list === "ordered" ? `${index + 1}.` : "\u2022"}</span>
                                <span className="min-w-0 flex-1">{line || "\u00A0"}</span>
                            </div>
                        ))
                    ) : (
                        node.metadata?.content
                    )}
                </div>
            )}
        </div>
    );
}

function VideoCompositionContent({ node, theme, onOpenComposer, onNodeAction }: NodeContentRendererProps) {
    const connectedCount = node.metadata?.references?.length || 0;
    // 对齐 LibTV 智能剪辑空态：剪刀图标 + 连接提示 + 三个尝试入口
    if (!connectedCount) {
        return (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2.5 px-4 text-center" style={{ background: theme.node.fill, color: theme.node.text }}>
                <Clapperboard className="size-7 opacity-35" />
                <div className="text-xs leading-5 opacity-65">空空如也，请连接视频节点后操作</div>
                <div className="w-full text-left text-[10px] opacity-45">尝试：</div>
                <div className="flex w-full flex-col gap-1">
                    {(["讲解视频", "批量广告", "素材混剪"] as const).map((label) => (
                        <button
                            key={label}
                            type="button"
                            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] transition hover:brightness-125"
                            style={{ color: theme.node.text }}
                            onClick={(event) => {
                                event.stopPropagation();
                                onOpenComposer?.();
                            }}
                            onMouseDown={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                        >
                            <Sparkles className="size-3 shrink-0 opacity-55" />
                            {label}
                        </button>
                    ))}
                </div>
            </div>
        );
    }
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-4 text-center" style={{ background: theme.node.fill, color: theme.node.text }}>
            <span className="grid size-11 place-items-center rounded-xl" style={{ background: theme.toolbar.activeBg, color: theme.node.placeholder }}>
                <Clapperboard className="size-5" />
            </span>
            <div className="text-xs leading-5 opacity-65">已连接 {connectedCount} 个视频节点，可继续编排合成要求</div>
            <div className="flex items-center gap-2">
                <button
                    type="button"
                    className="rounded-lg px-3 py-1.5 text-xs transition"
                    style={{ background: theme.toolbar.itemHover, color: theme.node.text }}
                    onClick={(event) => {
                        event.stopPropagation();
                        onNodeAction?.("composition-timeline");
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    时间轴编辑
                </button>
                <button
                    type="button"
                    className="rounded-lg px-3 py-1.5 text-xs transition"
                    style={{ background: theme.toolbar.itemHover, color: theme.node.text }}
                    onClick={(event) => {
                        event.stopPropagation();
                        onOpenComposer?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    编排合成
                </button>
            </div>
        </div>
    );
}

const LAPIAN_DIMENSIONS: { key: CanvasLapianDimension; label: string; icon: ReactNode }[] = [
    { key: "storyboard", label: "分镜", icon: <Clapperboard className="size-3" /> },
    { key: "motion", label: "动态", icon: <Sparkles className="size-3" /> },
    { key: "music", label: "音乐", icon: <Music2 className="size-3" /> },
];

/** 逐帧拉片节点（对齐 LibTV）：视频素材区 + 拆解维度 chips + 开始拉片。视频可上传到本节点，也可从画布视频节点连入。 */
function LapianContent({ node, theme, onNodeAction, onTextFormatChange, onUpload }: NodeContentRendererProps) {
    const videoUrl = useLazyMediaUrl(node.metadata?.storageKey, node.metadata?.content, "media");
    const analyzing = node.metadata?.status === "loading";
    const dimensions = node.metadata?.lapianDimensions?.length ? node.metadata.lapianDimensions : (["storyboard"] as CanvasLapianDimension[]);
    const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();
    const toggleDimension = (dim: CanvasLapianDimension) => {
        const next = dimensions.includes(dim) ? dimensions.filter((item) => item !== dim) : [...dimensions, dim];
        onTextFormatChange?.(node.id, { lapianDimensions: next.length ? next : ["storyboard"] });
    };
    return (
        <div className="flex h-full w-full flex-col gap-2 px-4 py-3" style={{ background: theme.node.fill, color: theme.node.text }}>
            <div className="text-[10px] font-medium opacity-50">视频素材</div>
            {videoUrl ? (
                <video src={videoUrl} className="h-20 w-full shrink-0 rounded-md bg-black object-cover" muted playsInline preload="metadata" onMouseDown={stop} onPointerDown={stop} />
            ) : (
                <button
                    type="button"
                    className="flex h-20 w-full shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed text-[11px] transition enabled:hover:brightness-125"
                    style={{ borderColor: theme.toolbar.border, color: theme.node.muted }}
                    onClick={(event) => {
                        event.stopPropagation();
                        onUpload?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <Upload className="size-4 opacity-60" />
                    上传视频开始
                </button>
            )}
            <div className="text-[10px] font-medium opacity-50">拆解维度（可多选，未选默认分镜）</div>
            <div className="flex items-center gap-1.5">
                {LAPIAN_DIMENSIONS.map((dim) => {
                    const active = dimensions.includes(dim.key);
                    return (
                        <button
                            key={dim.key}
                            type="button"
                            aria-pressed={active}
                            className="flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] transition"
                            style={active ? { borderColor: theme.ui.accent, background: theme.toolbar.activeBg, color: theme.toolbar.activeText } : { borderColor: theme.toolbar.border, color: theme.node.muted }}
                            onClick={(event) => {
                                event.stopPropagation();
                                toggleDimension(dim.key);
                            }}
                            onMouseDown={(event) => event.stopPropagation()}
                            onPointerDown={(event) => event.stopPropagation()}
                        >
                            {dim.icon}
                            {dim.label}
                        </button>
                    );
                })}
            </div>
            <button
                type="button"
                disabled={analyzing}
                className="mt-auto h-8 w-full rounded-md text-xs font-medium transition enabled:hover:brightness-110 disabled:opacity-45"
                style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}
                onClick={(event) => {
                    event.stopPropagation();
                    onNodeAction?.("lapian-start");
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                {analyzing ? "正在逐帧分析…" : "开始拉片"}
            </button>
            {!videoUrl ? <div className="text-center text-[10px] leading-4 opacity-40">或直接从画布把视频节点连入本节点</div> : null}
        </div>
    );
}

function DirectorContent({ theme, onOpenComposer }: NodeContentRendererProps) {
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-5 text-center" style={{ background: theme.node.fill, color: theme.node.text }}>
            <span className="grid size-11 place-items-center rounded-xl" style={{ background: theme.toolbar.activeBg, color: theme.node.placeholder }}>
                <Layers3 className="size-5" />
            </span>
            <div className="text-xs leading-5 opacity-70">
                在3D空间中搭建场景并进行多视角截图
            </div>
            <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-xs transition"
                style={{ background: theme.toolbar.itemHover, color: theme.node.text }}
                onClick={(event) => {
                    event.stopPropagation();
                    onOpenComposer?.();
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                打开导演台
            </button>
        </div>
    );
}

function ScriptNodeContent({ theme, onOpenComposer, node }: NodeContentRendererProps) {
    const title = node.metadata?.scriptTitle?.trim() || "脚本";
    const logline = node.metadata?.scriptLogline?.trim();
    const beatCount = node.metadata?.scriptBeats?.length ?? 0;
    const assetCount = node.metadata?.scriptAssets?.length ?? 0;
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-5 text-center" style={{ background: theme.node.fill, color: theme.node.text }}>
            <span className="grid size-11 place-items-center rounded-xl" style={{ background: theme.toolbar.activeBg, color: theme.node.placeholder }}>
                <FileText className="size-5" />
            </span>
            <div className="text-sm font-medium">{title}</div>
            <div className="text-xs leading-5 opacity-70">{logline || "编辑剧本、拆分镜，逐镜生成图片 / 视频"}</div>
            {beatCount || assetCount ? <div className="text-[11px] opacity-50">{beatCount} 个分镜 · {assetCount} 项资产</div> : null}
            <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-xs transition"
                style={{ background: theme.toolbar.itemHover, color: theme.node.text }}
                onClick={(event) => {
                    event.stopPropagation();
                    onOpenComposer?.();
                }}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
            >
                进入脚本编辑
            </button>
        </div>
    );
}

/** 判断是否「AI生成」媒体节点：有媒体内容且带生成痕迹（提示词/模型/生成记录），用户上传的素材不显示角标。 */
function isAiGeneratedMediaNode(node: CanvasNodeData) {
    if (node.type !== CanvasNodeType.Image && node.type !== CanvasNodeType.Video && node.type !== CanvasNodeType.Audio) return false;
    if (node.metadata?.canvasTool) return false;
    if (!node.metadata?.content && !node.metadata?.storageKey) return false;
    return Boolean(node.metadata?.prompt || node.metadata?.requestPrompt || node.metadata?.model || node.metadata?.generationRuns?.length);
}

function NodeTitleBadge({
    node,
    theme,
    inputCount,
    outputCount,
    onTitleChange,
}: {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    inputCount: number;
    outputCount: number;
    onTitleChange: (nodeId: string, title: string) => void;
}) {
    const Icon = node.type === CanvasNodeType.Image ? ImageIcon : node.type === CanvasNodeType.Video ? Video : node.type === CanvasNodeType.Audio ? Music2 : isGenerationConfigNode(node.type) ? Workflow : node.type === CanvasNodeType.Group ? Layers3 : FileText;
    const fallbackTitle = "未命名节点";
    const imageResolution = node.type === CanvasNodeType.Image && node.metadata?.naturalWidth && node.metadata?.naturalHeight
        ? `${Math.round(node.metadata.naturalWidth)} × ${Math.round(node.metadata.naturalHeight)}`
        .replace(/\D+/g, " x ") : "";
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const cancelRef = useRef(false);
    const commit = () => {
        if (cancelRef.current) {
            cancelRef.current = false;
            return;
        }
        onTitleChange(node.id, draft.trim() || fallbackTitle);
        setEditing(false);
    };

    return (
        <div
            data-canvas-no-zoom
            className={`canvas-node-title absolute -top-[24px] z-30 flex items-center gap-1 text-[11px] leading-4 ${node.type === CanvasNodeType.Image ? "inset-x-0 justify-between" : "left-0 max-w-full"}`}
            style={{ color: theme.node.label }}
        >
            <div className="flex min-w-0 items-center gap-1">
            <Icon className="pointer-events-none size-3 shrink-0 opacity-65" />
            {editing ? (
                <input
                    autoFocus
                    data-canvas-no-zoom
                    value={draft}
                    maxLength={64}
                    aria-label="节点名称"
                    className="h-6 min-w-24 max-w-52 select-text rounded-md border px-1.5 text-[11px] outline-none"
                    style={{ color: theme.node.text, background: theme.toolbar.panel, borderColor: theme.toolbar.border }}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={commit}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") {
                            event.preventDefault();
                            commit();
                        }
                        if (event.key === "Escape") {
                            cancelRef.current = true;
                            setEditing(false);
                        }
                    }}
                />
            ) : (
                <button
                    type="button"
                    tabIndex={-1}
                    data-canvas-no-zoom
                    title="双击重命名"
                    className="min-w-0 max-w-full cursor-default truncate text-left"
                    onDoubleClick={(event) => {
                        event.stopPropagation();
                        cancelRef.current = false;
                        setDraft(node.title || fallbackTitle);
                        setEditing(true);
                    }}
                >
                    {node.title || fallbackTitle}
                </button>
            )}
            </div>
            {inputCount > 0 || outputCount > 0 ? (
                <span className="canvas-node-relation-count" title={`输入 ${inputCount} · 输出 ${outputCount}`}>
                    {inputCount > 1 ? `${inputCount} 个参考` : outputCount > 1 ? `${outputCount} 个结果` : "已连接"}
                </span>
            ) : null}
            {/* 对齐 LibTV 节点标题栏的「AI生成」状态角标：仅 AI 生成且已有媒体内容的节点显示 */}
            {isAiGeneratedMediaNode(node) ? (
                <span className="shrink-0 rounded px-1 py-px text-[9px] font-medium leading-3" style={{ background: theme.toolbar.activeBg, color: theme.ui.accent }}>
                    AI生成
                </span>
            ) : null}
            {imageResolution ? <span className="shrink-0 tabular-nums opacity-60">{imageResolution}</span> : null}
        </div>
    );
}
function GroupTitleEditor({
    node,
    theme,
    onTitleChange,
}: {
    node: CanvasNodeData;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onTitleChange: (nodeId: string, title: string) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState("");
    const cancelRef = useRef(false);
    const fallbackTitle = node.metadata?.groupVariant === "storyboard" ? "分镜组" : "分组";
    const commit = () => {
        if (cancelRef.current) {
            cancelRef.current = false;
            return;
        }
        onTitleChange(node.id, draft.trim() || fallbackTitle);
        setEditing(false);
    };
    const sharedStyle: React.CSSProperties = {
        color: theme.node.text,
        background: theme.toolbar.panel,
        borderColor: theme.toolbar.border,
    };

    return (
        <div className="absolute right-2 top-2 z-40 max-w-[70%]">
            {editing ? (
                <input
                    autoFocus
                    data-canvas-no-zoom
                    value={draft}
                    maxLength={64}
                    className="h-7 w-40 select-text rounded-md border px-2 text-right text-xs outline-none"
                    style={sharedStyle}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={commit}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Enter") {
                            event.preventDefault();
                            commit();
                        }
                        if (event.key === "Escape") {
                            cancelRef.current = true;
                            setEditing(false);
                        }
                    }}
                />
            ) : (
                <button
                    type="button"
                    data-canvas-no-zoom
                    title="双击重命名"
                    className="block max-w-full truncate rounded-md border px-2 py-1 text-right text-xs font-medium"
                    style={sharedStyle}
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onDoubleClick={(event) => {
                        event.stopPropagation();
                        cancelRef.current = false;
                        setDraft(node.title || fallbackTitle);
                        setEditing(true);
                    }}
                >
                    {node.title || fallbackTitle}
                </button>
            )}
        </div>
    );
}

function TryActionList({ theme, actions }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; actions: Array<{ label: string; onClick?: () => void }> }) {
    return (
        <div className="flex h-full w-full flex-col items-start justify-center px-3 text-left">
            <div className="mb-1.5 text-[12px]" style={{ color: theme.node.placeholder }}>尝试：</div>
            <div className="flex max-w-full flex-col items-start gap-0.5">
                {actions.map((action) => (
                    <button
                        key={action.label}
                        type="button"
                        data-canvas-no-zoom
                        className="max-w-full rounded-md px-1 py-0.5 text-left text-[12px] leading-5 transition"
                        style={{ color: theme.node.text }}
                        onClick={(event) => {
                            event.stopPropagation();
                            action.onClick?.();
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        onPointerDown={(event) => event.stopPropagation()}
                        onMouseEnter={(event) => (event.currentTarget.style.background = theme.toolbar.itemHover)}
                        onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
                    >
                        {action.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

type NodeStarterKind = "text" | "image" | "video" | "comfyui" | "audio";

const nodeStarterVisuals: Record<NodeStarterKind, { label: string; description: string; icon: React.ElementType }> = {
    text: { label: "文本创作", description: "记录灵感，或直接衔接下游生成。", icon: FileText },
    image: { label: "图片素材", description: "上传参考图，作为后续创作的视觉基础。", icon: ImageIcon },
    video: { label: "视频生成", description: "选择生成方式，或连接参考素材后创作。", icon: Video },
    comfyui: { label: "ComfyUI 工作流", description: "选择工作流并连接上游素材后运行。", icon: Workflow },
    audio: { label: "音频素材", description: "导入声音素材，或连接到音频生成流程。", icon: Music2 },
};

function MediaNodePlaceholder({ kind, theme }: { kind: "text" | "image" | "video" | "audio"; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const Icon = kind === "text" ? FileText : kind === "image" ? ImageIcon : kind === "video" ? Video : Music2;
    const label = kind === "text" ? "文本" : kind === "image" ? "图片" : kind === "video" ? "视频" : "音频";
    return (
        <div className="canvas-node-media-placeholder relative flex h-full w-full items-center justify-center overflow-hidden rounded-[inherit]" style={{ background: theme.node.fill, color: theme.node.placeholder }}>
            <span aria-hidden className="canvas-node-media-placeholder-band absolute inset-x-0 top-1/2 h-[34%] -translate-y-1/2" />
            <span className="canvas-node-media-placeholder-icon relative grid size-14 place-items-center rounded-2xl border" style={{ background: theme.ui.controlFill, borderColor: theme.ui.hairline }}>
                <Icon className="size-7 opacity-45" />
            </span>
            <span className="sr-only">{label}节点为空</span>
        </div>
    );
}

function MediaNodeQuickActions({ kind, theme, onUpload, onOpenAssetPicker }: {
    kind: CanvasNodeType.Image | CanvasNodeType.Video | CanvasNodeType.Audio;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onUpload: () => void;
    onOpenAssetPicker?: () => void;
}) {
    const uploadLabel = kind === CanvasNodeType.Image ? "上传图片" : kind === CanvasNodeType.Video ? "上传视频" : "上传音频";
    const actions = [
        { label: "上传", title: uploadLabel, icon: <Upload className="size-3.5" />, onClick: onUpload },
        ...(onOpenAssetPicker ? [{ label: "素材库", title: "从素材库选择", icon: <FolderOpen className="size-3.5" />, onClick: onOpenAssetPicker }] : []),
    ];
    return (
        <div
            data-canvas-no-zoom
            className="canvas-node-media-actions pointer-events-auto absolute bottom-[calc(100%+34px)] left-1/2 z-[65] flex -translate-x-1/2 items-center gap-1 rounded-xl border p-1.5 shadow-[0_14px_34px_rgba(0,0,0,.28)] backdrop-blur-xl"
            style={{ background: `${theme.toolbar.panel}f2`, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {actions.map((action) => (
                <button
                    key={action.title}
                    type="button"
                    title={action.title}
                    aria-label={action.title}
                    className="flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-[11px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
                    onClick={(event) => {
                        event.stopPropagation();
                        action.onClick();
                    }}
                >
                    {action.icon}
                    {action.label}
                </button>
            ))}
        </div>
    );
}

function NodeStarterPanel({ theme, kind = "text", actions }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; kind?: NodeStarterKind; actions: Array<{ label: string; onClick?: () => void }> }) {
    const visual = nodeStarterVisuals[kind];
    const NodeIcon = visual.icon as LucideIcon;
    const actionIcons = kind === "text" ? [FileText, Video, Music2, Clapperboard] : kind === "image" ? [ImageIcon, FolderOpen] : kind === "video" ? [Video, Sparkles] : kind === "comfyui" ? [Workflow, Sparkles] : [Music2, Sparkles];

    return (
        <div className="relative flex h-full w-full overflow-hidden rounded-[inherit] p-4 text-left" style={{ background: `linear-gradient(145deg, ${theme.node.panel}, ${theme.node.fill})` }}>
            <div className="relative z-10 flex h-full w-full flex-col">
                <div className="mb-3 flex items-center justify-between gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-lg border" style={{ background: theme.toolbar.activeBg, borderColor: theme.ui.accentSoft, color: theme.ui.accent }}>
                        <NodeIcon className="size-[18px]" />
                    </span>
                    <div className="min-w-0 pt-0.5">
                        <div className="text-[11px] font-semibold" style={{ color: theme.node.text }}>{visual.label}</div>
                        <p className="mt-1 text-[10px] leading-4" style={{ color: theme.node.muted }}>{visual.description}</p>
                    </div>
                    <span className="ml-auto shrink-0 text-[10px] font-medium opacity-45">尝试</span>
                </div>
                <div className="mt-auto grid gap-1.5 pt-4">
                    {actions.map((action, index) => {
                        const ActionIcon = actionIcons[index] ?? Sparkles;
                        return (
                            <button
                                key={action.label}
                                type="button"
                                data-canvas-no-zoom
                                className="group/node-action flex h-9 w-full items-center gap-2 rounded-md border px-2.5 text-left text-[11px] font-medium transition-colors"
                                style={{ background: index === 0 ? theme.toolbar.activeBg : theme.ui.controlFill, borderColor: index === 0 ? theme.ui.accentSoft : theme.ui.hairline, color: theme.node.text }}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    action.onClick?.();
                                }}
                                onMouseDown={(event) => event.stopPropagation()}
                                onPointerDown={(event) => event.stopPropagation()}
                                onMouseEnter={(event) => (event.currentTarget.style.background = theme.toolbar.itemHover)}
                                onMouseLeave={(event) => (event.currentTarget.style.background = index === 0 ? theme.toolbar.activeBg : theme.ui.controlFill)}
                            >
                                <ActionIcon className="size-3.5 shrink-0" style={{ color: index === 0 ? theme.ui.accent : theme.node.muted }} />
                                <span className="min-w-0 flex-1 truncate">{action.label}</span>
                                <ChevronRight className="size-3 shrink-0 opacity-35 transition-transform group-hover/node-action:translate-x-0.5" />
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

function ResourceLabelBadge({ reference }: { reference: CanvasResourceReference }) {
    return <Badge className={cn("pointer-events-none absolute right-2 top-2 z-30 h-auto rounded-md px-1.5 py-0.5 text-[10px]", reference.active ? "bg-[#2f80ff] text-white shadow-sm" : "bg-black/35 text-white/75")}>{reference.label}</Badge>;
}

function ImageNodeContent(props: NodeContentRendererProps) {
    const hasMedia = props.node.metadata?.content || props.node.metadata?.storageKey;
    if (!hasMedia && props.isBatchRoot) {
        const content =
                props.node.metadata?.status === "loading" ? (
                <LoadingContent node={props.node} theme={props.theme} />
            ) : props.node.metadata?.status === "error" ? (
                <ErrorContent node={props.node} theme={props.theme} onRetry={props.onRetry} />
            ) : (
                <EmptyImageContent {...props} isBatchRoot={false} />
            );
        return (
            <BatchFrame batchCount={props.batchCount} batchExpanded={props.batchExpanded} batchOpening={props.batchOpening} batchRecovering={props.batchRecovering} onToggleBatch={props.onToggleBatch}>
                {content}
            </BatchFrame>
        );
    }
    if (!hasMedia) return <EmptyImageContent {...props} />;

    return (
        <ImageContent
            node={props.node}
            isBatchRoot={props.isBatchRoot}
            batchCount={props.batchCount}
            batchExpanded={props.batchExpanded}
            batchOpening={props.batchOpening}
            batchRecovering={props.batchRecovering}
            onToggleBatch={props.onToggleBatch}
            onSetBatchPrimary={props.onSetBatchPrimary}
        />
    );
}

function ComfyUiContent({ node, theme }: NodeContentRendererProps) {
    const capability = node.metadata?.comfyCapability || "text-to-text";
    const output = capability.endsWith("-to-video") || capability === "reference-video" ? "video" : capability.endsWith("-to-image") ? "image" : "text";
    return <MediaNodePlaceholder kind={output} theme={theme} />;
}

function EmptyImageContent({ node, theme, isBatchRoot, batchCount, batchExpanded, batchOpening, batchRecovering, onToggleBatch, onNodeAction, onUpload }: NodeContentRendererProps) {
    if (node.metadata?.canvasTool === "panorama360") {
        return (
            <NodeStarterPanel kind="image"
                theme={theme}
                actions={[
                    { label: "生成360全景", onClick: () => onNodeAction?.("image-to-panorama") },
                    { label: "上传360图片", onClick: onUpload },
                ]}
            />
        );
    }
    const content = <MediaNodePlaceholder kind="image" theme={theme} />;
    if (isBatchRoot)
        return (
            <BatchFrame batchCount={batchCount} batchExpanded={batchExpanded} batchOpening={batchOpening} batchRecovering={batchRecovering} onToggleBatch={onToggleBatch}>
                {content}
            </BatchFrame>
        );
    return content;
}

function formatVideoTime(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60);
    return `${minutes}:${String(remaining).padStart(2, "0")}`;
}

function waitForVideoEvent(video: HTMLVideoElement, eventName: "loadedmetadata" | "loadeddata" | "seeked") {
    return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
            video.removeEventListener(eventName, handleSuccess);
            video.removeEventListener("error", handleError);
        };
        const handleSuccess = () => {
            cleanup();
            resolve();
        };
        const handleError = () => {
            cleanup();
            reject(new Error("视频帧读取失败"));
        };
        video.addEventListener(eventName, handleSuccess, { once: true });
        video.addEventListener("error", handleError, { once: true });
    });
}

function waitForDecodedVideoFrame(video: HTMLVideoElement) {
    return new Promise<void>((resolve, reject) => {
        let timeout = 0;
        const cleanup = () => {
            window.clearTimeout(timeout);
            video.removeEventListener("error", onError);
        };
        const finish = () => {
            cleanup();
            resolve();
        };
        const onError = () => {
            cleanup();
            reject(new Error("视频帧解码失败"));
        };
        video.addEventListener("error", onError, { once: true });
        timeout = window.setTimeout(finish, 800);
        if ("requestVideoFrameCallback" in video) {
            video.requestVideoFrameCallback(() => finish());
            return;
        }
        window.requestAnimationFrame(() => window.requestAnimationFrame(finish));
    });
}

function VideoNodeContent({ node, theme, isSelected, onCaptureVideoFrame, onUpload, onOpenComposer, onNodeAction }: NodeContentRendererProps) {
    const src = useLazyMediaUrl(node.metadata?.storageKey, node.metadata?.content, "media");
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [failedSrc, setFailedSrc] = useState("");
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [muted, setMuted] = useState(false);
    const [volume, setVolume] = useState(1);
    const [capturing, setCapturing] = useState<"first" | "current" | "last" | null>(null);
    const [captureFailed, setCaptureFailed] = useState(false);

    const stopControlEvent = (event: React.SyntheticEvent) => event.stopPropagation();
    const togglePlayback = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) void video.play();
        else video.pause();
    }, []);
    const toggleFullscreen = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;
        if (document.fullscreenElement) void document.exitFullscreen();
        else void container.requestFullscreen();
    }, []);
    const captureFrame = useCallback(
        async (kind: "first" | "current" | "last") => {
            const visibleVideo = videoRef.current;
            if (!visibleVideo || !onCaptureVideoFrame || capturing) return;
            setCapturing(kind);
            setCaptureFailed(false);
            let captureVideo = visibleVideo;
            let objectUrl = "";
            let temporaryVideo: HTMLVideoElement | null = null;
            const restoreTime = visibleVideo.currentTime;
            try {
                const storageKey = node.metadata?.storageKey;
                if (storageKey) {
                    const blob = await getMediaBlob(storageKey);
                    if (blob) {
                        objectUrl = URL.createObjectURL(blob);
                        temporaryVideo = document.createElement("video");
                        temporaryVideo.preload = "auto";
                        temporaryVideo.muted = true;
                        temporaryVideo.playsInline = true;
                        temporaryVideo.src = objectUrl;
                        await waitForVideoEvent(temporaryVideo, "loadedmetadata");
                        if (temporaryVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
                            await waitForVideoEvent(temporaryVideo, "loadeddata");
                        }
                        captureVideo = temporaryVideo;
                    }
                }
                if (!temporaryVideo && (visibleVideo.currentSrc || visibleVideo.src)) {
                    temporaryVideo = document.createElement("video");
                    temporaryVideo.crossOrigin = "anonymous";
                    temporaryVideo.preload = "auto";
                    temporaryVideo.muted = true;
                    temporaryVideo.playsInline = true;
                    temporaryVideo.src = visibleVideo.currentSrc || visibleVideo.src;
                    await waitForVideoEvent(temporaryVideo, "loadedmetadata");
                    if (temporaryVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
                        await waitForVideoEvent(temporaryVideo, "loadeddata");
                    }
                    captureVideo = temporaryVideo;
                }
                const captureDuration = Number.isFinite(captureVideo.duration) ? captureVideo.duration : duration;
                const targetTime = kind === "first" ? Math.min(0.1, Math.max(0, captureDuration - 0.01)) : kind === "last" ? Math.max(0, captureDuration - 0.05) : Math.min(restoreTime, Math.max(0, captureDuration - 0.01));
                if (Math.abs(captureVideo.currentTime - targetTime) > 0.001) {
                    const seeked = waitForVideoEvent(captureVideo, "seeked");
                    captureVideo.currentTime = targetTime;
                    await seeked;
                }
                await waitForDecodedVideoFrame(captureVideo);
                const width = captureVideo.videoWidth;
                const height = captureVideo.videoHeight;
                if (!width || !height) throw new Error("视频画面尚未加载完成");
                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const context = canvas.getContext("2d");
                if (!context) throw new Error("无法创建截帧画布");
                context.drawImage(captureVideo, 0, 0, width, height);
                await onCaptureVideoFrame(node, canvas.toDataURL("image/png"), kind);
            } catch (error) {
                console.error("[canvas-video] capture frame failed", error);
                setCaptureFailed(true);
            } finally {
                temporaryVideo?.removeAttribute("src");
                temporaryVideo?.load();
                if (objectUrl) URL.revokeObjectURL(objectUrl);
                setCapturing(null);
            }
        },
        [capturing, duration, node, onCaptureVideoFrame],
    );

    if (!src)
        return (
            <NodeStarterPanel
                kind="video"
                theme={theme}
                actions={[
                    { label: "首尾帧生成视频", onClick: () => onNodeAction?.("video-mode-first-last") },
                    { label: "首帧生成视频", onClick: () => onNodeAction?.("video-mode-first-frame") },
                    { label: "文生视频", onClick: () => onNodeAction?.("video-mode-text") },
                ]}
            />
        );
    if (failedSrc === src) return <EmptyState icon={<Video className="size-7 opacity-35" />} label="视频加载失败" theme={theme} />;

    return (
        <div ref={containerRef} className="canvas-node-media group/video relative h-full w-full overflow-hidden rounded-[inherit] bg-black">
            <video
                ref={videoRef}
                src={src}
                preload="metadata"
                playsInline
                draggable={false}
                onDragStart={(event) => event.preventDefault()}
                onLoadedMetadata={(event) => {
                    setDuration(event.currentTarget.duration || 0);
                    setVolume(event.currentTarget.volume);
                    setMuted(event.currentTarget.muted);
                }}
                onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onEnded={() => setPlaying(false)}
                onVolumeChange={(event) => {
                    setVolume(event.currentTarget.volume);
                    setMuted(event.currentTarget.muted);
                }}
                onError={() => setFailedSrc(src)}
                className="pointer-events-none h-full w-full select-none object-contain"
            />
            <div
                className={cn(
                    "pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col gap-1.5 bg-gradient-to-t from-black/90 via-black/65 to-transparent px-2.5 pb-2 pt-8 text-white transition-opacity duration-200",
                    isSelected ? "opacity-100" : "opacity-0 group-hover/video:opacity-100",
                )}
                onPointerDown={stopControlEvent}
                onMouseDown={stopControlEvent}
                onClick={stopControlEvent}
                onDoubleClick={stopControlEvent}
                onWheel={stopControlEvent}
            >
                <input
                    aria-label="视频进度"
                    type="range"
                    min={0}
                    max={Math.max(duration, 0.01)}
                    step={0.01}
                    value={Math.min(currentTime, Math.max(duration, 0.01))}
                    className="h-1 w-full cursor-pointer accent-white"
                    onChange={(event) => {
                        const time = Number(event.target.value);
                        if (videoRef.current) videoRef.current.currentTime = time;
                        setCurrentTime(time);
                    }}
                />
                <div className="flex min-w-0 items-center gap-2">
                    <button type="button" className="grid size-7 shrink-0 place-items-center rounded-md text-white/90 transition hover:bg-white/15 hover:text-white" title={playing ? "暂停" : "播放"} onClick={togglePlayback}>
                        {playing ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}
                    </button>
                    <span className="shrink-0 text-[10px] tabular-nums text-white/75">{formatVideoTime(currentTime)} / {formatVideoTime(duration)}</span>
                    <button
                        type="button"
                        className="grid size-7 shrink-0 place-items-center rounded-md text-white/80 transition hover:bg-white/15 hover:text-white"
                        title={muted ? "取消静音" : "静音"}
                        onClick={() => {
                            const video = videoRef.current;
                            if (video) video.muted = !video.muted;
                        }}
                    >
                        {muted || volume === 0 ? <VolumeX className="size-3.5" /> : <Volume2 className="size-3.5" />}
                    </button>
                    <input
                        aria-label="视频音量"
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={muted ? 0 : volume}
                        className="h-1 min-w-10 max-w-16 flex-1 cursor-pointer accent-white"
                        onChange={(event) => {
                            const nextVolume = Number(event.target.value);
                            const video = videoRef.current;
                            if (!video) return;
                            video.volume = nextVolume;
                            video.muted = nextVolume === 0;
                        }}
                    />
                    <button type="button" className="ml-auto grid size-7 shrink-0 place-items-center rounded-md text-white/80 transition hover:bg-white/15 hover:text-white" title="全屏" onClick={toggleFullscreen}>
                        <Maximize2 className="size-3.5" />
                    </button>
                </div>
                {onCaptureVideoFrame ? (
                    <div className="flex items-center gap-1 border-t border-white/10 pt-1.5">
                        {([ ["first", "截取首帧"], ["current", "截取当前帧"], ["last", "截取尾帧"] ] as const).map(([kind, label]) => (
                            <button
                                key={kind}
                                type="button"
                                disabled={Boolean(capturing)}
                                className="min-w-0 flex-1 truncate rounded-md px-1.5 py-1 text-[10px] text-white/75 transition hover:bg-white/15 hover:text-white disabled:cursor-wait disabled:opacity-45"
                                title={label}
                                onClick={() => void captureFrame(kind)}
                            >
                                {capturing === kind ? "截取中..." : label}
                            </button>
                        ))}
                        {captureFailed ? <span className="shrink-0 text-[10px] text-red-300">截帧失败</span> : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}

function AudioNodeContent({ node, theme }: NodeContentRendererProps) {
    const src = useLazyMediaUrl(node.metadata?.storageKey, node.metadata?.content, "media");
    if (!src) return <MediaNodePlaceholder kind="audio" theme={theme} />;
    return (
        <div className="canvas-node-media flex h-full w-full flex-col justify-center gap-3 px-4" style={{ background: theme.node.fill, color: theme.node.text }}>
            <div className="flex min-w-0 items-center gap-2 text-sm opacity-70">
                <Music2 className="size-4 shrink-0" />
                <span className="truncate">{node.title || "音频"}</span>
            </div>
            <audio src={src} controls className="w-full" data-canvas-no-zoom />
        </div>
    );
}

function ImageContent({
    node,
    isBatchRoot,
    batchCount,
    batchExpanded,
    batchOpening,
    batchRecovering,
    onToggleBatch,
    onSetBatchPrimary,
}: {
    node: CanvasNodeData;
    isBatchRoot: boolean;
    batchCount: number;
    batchExpanded: boolean;
    batchOpening: boolean;
    batchRecovering: boolean;
    onToggleBatch?: () => void;
    onSetBatchPrimary?: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isBatchChild = Boolean(node.metadata?.batchRootId);
    const imgSrc = useLazyMediaUrl(node.metadata?.storageKey, node.metadata?.content, "image");

    return (
        <BatchFrame batchCount={isBatchRoot ? batchCount : 0} batchExpanded={batchExpanded} batchOpening={batchOpening} batchRecovering={batchRecovering} onToggleBatch={onToggleBatch}>
            <div className="canvas-node-media h-full w-full overflow-hidden rounded-[inherit]">
                {imgSrc ? (
                    <div className="relative h-full w-full">
                        <img
                            src={imgSrc}
                            alt={node.title}
                            draggable={false}
                            decoding="async"
                            onDragStart={(event) => event.preventDefault()}
                            className={`pointer-events-none block h-full w-full select-none ${node.metadata?.freeResize ? "object-fill" : "object-contain"}`}
                        />
                        {node.metadata?.canvasTool === "panorama360" ? <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/55 px-2 py-1 text-[10px] font-medium text-white/80 backdrop-blur">360</span> : null}
                    </div>
                ) : (
                    <div className="flex h-full w-full items-center justify-center" style={{ background: theme.node.fill, color: theme.node.placeholder }} aria-label="图片加载中">
                        <ImageIcon className="size-6 opacity-30" />
                    </div>
                )}
            </div>
            {isBatchRoot ? (
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="absolute right-2.5 top-2.5 z-30 h-8 rounded-md border px-2.5 text-xs font-semibold shadow-[0_6px_18px_rgba(15,23,42,.10)] backdrop-blur-md transition hover:scale-[1.02]"
                    style={{ background: `${theme.toolbar.panel}d9`, borderColor: `${theme.toolbar.border}cc`, color: theme.node.text }}
                    aria-label={batchExpanded ? "图片组已展开" : "图片组已收起"}
                    onClick={(event) => {
                        event.stopPropagation();
                        onToggleBatch?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <span className="leading-none text-[#2f80ff]">{batchCount}</span>
                    <ChevronRight className={`size-3.5 opacity-55 transition-transform ${batchExpanded ? "rotate-90" : ""}`} />
                </Button>
            ) : null}
            {isBatchChild ? (
                <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    className="absolute right-3 top-3 z-30 h-9 rounded-xl border px-2.5 text-xs opacity-0 shadow-[0_8px_20px_rgba(68,64,60,.13)] backdrop-blur-md transition group-hover/batch:opacity-100 hover:scale-[1.02]"
                    style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
                    onClick={(event) => {
                        event.stopPropagation();
                        onSetBatchPrimary?.();
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                >
                    <Star className="size-3.5 text-[#2f80ff]" />
                    设为主图
                </Button>
            ) : null}
        </BatchFrame>
    );
}

function ImageInfoBar({ node }: { node: CanvasNodeData }) {
    const width = Math.round(node.metadata?.naturalWidth || node.width);
    const height = Math.round(node.metadata?.naturalHeight || node.height);
    const size = formatBytes(node.metadata?.bytes || 0);
    return (
        <div className="pointer-events-none absolute bottom-3 right-3 z-40 max-w-[calc(100%-24px)]">
            <Badge className="max-w-full truncate rounded-md bg-black/55 px-2 py-1 text-[11px] font-medium leading-none text-white backdrop-blur-sm">
                {width} x {height}
                {size ? ` · ${size}` : ""}
            </Badge>
        </div>
    );
}

function BatchFrame({ batchCount, batchExpanded, batchOpening, batchRecovering, onToggleBatch, children }: { batchCount: number; batchExpanded: boolean; batchOpening: boolean; batchRecovering: boolean; onToggleBatch?: () => void; children: ReactNode }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const isBatchRoot = batchCount > 1;
    return (
        <div className="group/batch relative h-full w-full overflow-visible">
            {isBatchRoot ? (
                <div className="pointer-events-none absolute inset-0 overflow-visible">
                    {Array.from({ length: Math.min(batchCount - 1, 5) }).map((_, index) => (
                        <div
                            key={index}
                            className="absolute rounded-[inherit] border shadow-[0_14px_34px_rgba(68,64,60,.16)] transition-all duration-300 group-hover/batch:translate-x-2"
                            style={{
                                inset: 0,
                                background: `linear-gradient(135deg, ${theme.node.panel}, ${theme.node.fill})`,
                                borderColor: theme.node.stroke,
                                opacity: batchExpanded && !batchOpening ? 0.34 : 1,
                                transform:
                                    batchOpening || batchRecovering ? `translate(${54 + index * 22}px, ${20 + index * 12}px) rotate(${8 + index * 5}deg) scale(.98)` : `translate(${34 + index * 18}px, ${14 + index * 10}px) rotate(${6 + index * 4}deg)`,
                                zIndex: -index - 1,
                            }}
                        />
                    ))}
                </div>
            ) : null}
            {children}
        </div>
    );
}
function ResizeHandle({ corner, visible, onMouseDown }: { corner: ResizeCorner; visible: boolean; onMouseDown: (event: ResizeStartEvent, corner: ResizeCorner) => void }) {
    const positionClass = {
        "top-left": "-left-[14px] -top-[14px] cursor-nwse-resize",
        "top-right": "-right-[14px] -top-[14px] cursor-nesw-resize",
        "bottom-left": "-bottom-[14px] -left-[14px] cursor-nesw-resize",
        "bottom-right": "-bottom-[14px] -right-[14px] cursor-nwse-resize",
    }[corner];

    return (
        <div
            className={`nodrag nopan group/resize absolute z-50 size-7 pointer-events-auto ${positionClass}`}
            onPointerDown={(event) => onMouseDown(event, corner)}
            onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
            }}
        >
            <span className={`canvas-node-resize-dot absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-[2px] border transition ${visible ? "scale-100 opacity-100" : "scale-75 opacity-0 group-hover/resize:scale-100 group-hover/resize:opacity-100"}`} />
        </div>
    );
}

function NodePinIndicator({ node, theme }: { node: CanvasNodeData; theme: (typeof canvasThemes)[keyof typeof canvasThemes] }) {
    const pin = getPinColor(node);
    const color = pin ? getPinColorValue(pin) : undefined;
    if (!color) return null;
    return (
        <span
            title={getPinColorLabel(pin) ?? pin}
            className="pointer-events-none absolute right-2 top-2 z-30 size-2.5 rounded-full"
            style={{ background: color, boxShadow: `0 0 0 2px ${theme.node.panel}` }}
        />
    );
}

function ConnectionHandleDot({ side, visible, active, onClickCreate }: { side: "left" | "right"; visible: boolean; active: boolean; onClickCreate?: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const scaleRef = useCanvasScaleRef();
    const isSource = side === "right";
    const downRef = useRef<{ x: number; y: number } | null>(null);
    const finishRef = useRef<((event: PointerEvent) => void) | null>(null);
    const magnetRef = useRef<HTMLSpanElement>(null);
    const plusVisibility = active
        ? "opacity-100 scale-110"
        : visible
          ? "opacity-100 scale-100"
          : "opacity-0 scale-75 group-hover/connection-handle:opacity-100 group-hover/connection-handle:scale-100";

    const resetMagnet = () => {
        const magnet = magnetRef.current;
        if (!magnet) return;
        magnet.style.transition = "transform 180ms cubic-bezier(.2,.8,.2,1)";
        magnet.style.transform = "translate3d(0,0,0)";
    };

    const handleMagnetMove = (event: React.PointerEvent<HTMLSpanElement>) => {
        if (downRef.current) return;
        const magnet = magnetRef.current;
        if (!magnet) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const dx = event.clientX - (bounds.left + bounds.width / 2);
        const dy = event.clientY - (bounds.top + bounds.height / 2);
        const distance = Math.hypot(dx, dy);
        if (distance > 48) {
            resetMagnet();
            return;
        }
        const travel = Math.min(distance, 24);
        const ratio = distance ? travel / distance : 0;
        // 只向外磁吸：磁吸区中心在节点边缘外侧 24*k（屏幕像素），圆球半径 12px，
        // 向内最多移动到贴住节点边缘，不允许被吸进节点内部。
        const maxInward = Math.max(24 * scaleRef.current - 12, 0);
        const rawTx = dx * ratio;
        const tx = side === "left" ? Math.min(rawTx, maxInward) : Math.max(rawTx, -maxInward);
        magnet.style.transition = "transform 70ms linear";
        magnet.style.transform = `translate3d(${tx}px, ${dy * ratio}px, 0)`;
    };

    // TapNow 右侧 +：单击（按下-抬起位移 ≤5px）触发创建下游节点。
    // 拖拽连线由 leafer-canvas 通过 data-handle 消费 pointerdown（preventDefault + setPointerCapture，
    // 会抑制 click 合成事件），故在此自行检测单击：window 冒泡阶段监听 pointerup，确保画布先完成
    // 连线清理（clearTempEdge / onConnectEnd），再触发宿主创建回调。
    useEffect(() => () => {
        const finish = finishRef.current;
        if (!finish) return;
        window.removeEventListener("pointerup", finish);
        window.removeEventListener("pointercancel", finish);
    }, []);

    const handlePointerDown = (event: React.PointerEvent) => {
        if (!onClickCreate) return;
        const previousFinish = finishRef.current;
        if (previousFinish) {
            window.removeEventListener("pointerup", previousFinish);
            window.removeEventListener("pointercancel", previousFinish);
        }
        downRef.current = { x: event.clientX, y: event.clientY };
        const pointerId = event.pointerId;
        const finish = (upEvent: PointerEvent) => {
            if (upEvent.pointerId !== pointerId) return;
            window.removeEventListener("pointerup", finish);
            window.removeEventListener("pointercancel", finish);
            finishRef.current = null;
            const down = downRef.current;
            downRef.current = null;
            resetMagnet();
            if (upEvent.type === "pointerup" && down && Math.hypot(upEvent.clientX - down.x, upEvent.clientY - down.y) <= 5) {
                onClickCreate();
            }
        };
        finishRef.current = finish;
        window.addEventListener("pointerup", finish);
        window.addEventListener("pointercancel", finish);
    };

    return (
        <div
            data-handle
            data-handle-type={isSource ? "source" : "target"}
            className="pointer-events-none !z-40 absolute top-0 h-full"
            style={{ [side]: "-48px", width: "48px" }}
        >
            {/* 磁吸区在屏幕上保持恒定大小（64px）：节点处于 scale(k) 视口内，
                用 transform: scale(calc(1 / var(--canvas-k))) 反向补偿，CSS 变量随缩放
                实时更新，无需节点重渲染。group-hover 挂在磁吸区上，保证任意缩放
                下鼠标经过 64px 恒定区域即显示圆球；尺寸适中避免相邻节点误触。 */}
            <span
                onPointerDown={handlePointerDown}
                onPointerMove={handleMagnetMove}
                onPointerLeave={resetMagnet}
                className="canvas-connection-handle group/connection-handle pointer-events-auto absolute left-1/2 top-1/2 flex size-16 cursor-crosshair items-center justify-center"
            >
                <span ref={magnetRef} className="pointer-events-none grid place-items-center will-change-transform">
                    <span
                        className={`canvas-node-connection-dot pointer-events-none relative grid size-6 place-items-center rounded-full border transition duration-150 ${plusVisibility}`}
                        style={{
                            background: active ? theme.ui.accent : theme.ui.materialElevated,
                            borderColor: active ? theme.ui.accent : theme.node.stroke,
                            color: active ? theme.canvas.background : theme.node.muted,
                            boxShadow: active ? `0 0 0 4px ${theme.ui.accentSoft}` : undefined,
                        }}
                    >
                        <span className="absolute left-1/2 top-1/2 h-2.5 w-[1.5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
                        <span className="absolute left-1/2 top-1/2 h-[1.5px] w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-current" />
                    </span>
                </span>
            </span>
        </div>
    );
}
