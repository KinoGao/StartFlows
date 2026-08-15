"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as LUI from "leafer-ui";
import { Editor, EditorEvent, EditorMoveEvent, EditorScaleEvent } from "@leafer-in/editor";
import "@leafer-in/resize";
import "@leafer-in/viewport";

import { canvasThemes, type CanvasBackgroundMode } from "@/flowcanvas/lib/canvas-theme";
import { peekImageThumbnailUrl, resolveImageThumbnailUrl } from "@/flowcanvas/services/image-storage";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";
import { CanvasNodeType, type CanvasAlignmentGuides, type CanvasConnection, type CanvasNodeData, type ViewportTransform } from "../types";
import { CanvasScaleCtx } from "./canvas-scale-context";
import { buildSpatialIndex, querySpatialIndex } from "../utils/canvas-spatial-index";
import { buildConnectionPathFromPoints, getConnectionPoints, getNodeConnectionPoint } from "../utils/canvas-connection-geometry";
import { MAX_CANVAS_ZOOM, MIN_CANVAS_ZOOM, canvasToScreen, clampViewport, screenToCanvas, stepCanvasZoom, viewportToCssTransform, sameViewport } from "./leafer-viewport";

type LeaferCanvasProps = {
    containerRef: React.RefObject<HTMLDivElement | null>;
    viewport: ViewportTransform;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
    backgroundMode?: CanvasBackgroundMode;
    alignmentGuides?: CanvasAlignmentGuides | null;
    selectedNodeIds: Set<string>;
    selectedConnectionId: string | null;
    relatedNodeIds?: Set<string>;
    relatedConnectionIds?: Set<string>;
    onViewportChange: (viewport: ViewportTransform) => void;
    onViewportPresentation?: (viewport: ViewportTransform) => void;
    onNodePointerDown?: (nodeId: string, modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => boolean;
    onNodeTap?: (nodeId: string) => void;
    onNodeDragStart?: (nodeId: string) => void;
    resolveNodeMove?: (nodeId: string, position: { x: number; y: number }) => { x: number; y: number };
    onNodesTransform?: (updates: Array<{ id: string; position: { x: number; y: number }; width: number; height: number }>) => void;
    onNodesTransformEnd?: () => void;
    onNodeHoverChange?: (nodeId: string | null) => void;
    onNodeContextMenu?: (nodeId: string, clientX: number, clientY: number) => void;
    onCanvasMouseDown?: (event: React.PointerEvent<HTMLDivElement>, canvasPos: { x: number; y: number }) => void;
    onCanvasDeselect?: () => void;
    onContextMenu?: (event: React.MouseEvent, canvasPos: { x: number; y: number }) => void;
    onCanvasDoubleClick?: (event: React.MouseEvent, canvasPos: { x: number; y: number }) => void;
    onConnectStart?: (nodeId: string, handleType: "source" | "target") => void;
    onConnectEnd?: (canvasPos?: { x: number; y: number }) => void;
    onConnect?: (fromNodeId: string, toNodeId: string) => void;
    onEdgeClick?: (connectionId: string) => void;
    onEdgeContextMenu?: (connectionId: string, clientX: number, clientY: number) => void;
    onDrop?: (files: FileList, canvasPos: { x: number; y: number }) => void;
    onSelectionBox?: (nodeIds: string[], mode: 'replace' | 'add' | 'toggle') => void;
    connectingParams?: { nodeId: string; handleType: "source" | "target" } | null;
    pendingConnection?: {
        connection: { nodeId: string; handleType: "source" | "target" };
        position: { x: number; y: number };
    } | null;
    connectionTargetNodeId?: string | null;
    onConnectionTargetChange?: (nodeId: string | null) => void;
    onReady?: () => void;
    children?: React.ReactNode;
};

const EMPTY_NODES: CanvasNodeData[] = [];
const EMPTY_CONNECTIONS: CanvasConnection[] = [];
const EMPTY_ID_SET = new Set<string>();
const CONNECTION_SNAP_RADIUS = 48;
const CONNECTION_SNAP_RELEASE_RADIUS = 64;
const CANVAS_NODE_RADIUS = 8;
const CANVAS_READY_FALLBACK_MS = 4_000;

type LeaferConnectionVisual = {
    hit: LUI.Path;
    line: LUI.Path;
    flow: LUI.Path[];
    hovered: boolean;
    path: string;
    styleSignature: string;
};

export function LeaferCanvas({
    containerRef,
    viewport,
    nodes = EMPTY_NODES,
    connections = EMPTY_CONNECTIONS,
    backgroundMode = "dots",
    alignmentGuides,
    selectedNodeIds,
    selectedConnectionId,
    relatedNodeIds,
    relatedConnectionIds,
    onViewportChange,
    onViewportPresentation,
    onNodePointerDown,
    onNodeTap,
    onNodeDragStart,
    resolveNodeMove,
    onNodesTransform,
    onNodesTransformEnd,
    onNodeHoverChange,
    onNodeContextMenu,
    onCanvasMouseDown,
    onCanvasDeselect,
    onContextMenu,
    onCanvasDoubleClick,
    onConnectStart,
    onConnectEnd,
    onConnect,
    onEdgeClick,
    onEdgeContextMenu,
    onDrop,
    onSelectionBox,
    connectingParams,
    pendingConnection,
    connectionTargetNodeId,
    onConnectionTargetChange,
    onReady,
    children,
}: LeaferCanvasProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const themeRef = useRef(theme);
    themeRef.current = theme;
    const backgroundModeRef = useRef(backgroundMode);
    backgroundModeRef.current = backgroundMode;
    const alignmentGuidesRef = useRef(alignmentGuides);
    alignmentGuidesRef.current = alignmentGuides;
    const scaleRef = useRef(viewport.k);
    const viewportRef = useRef(viewport);
    const committedViewportRef = useRef(viewport);
    const leaferContainerRef = useRef<HTMLDivElement>(null);
    const viewportElementRef = useRef<HTMLDivElement>(null);
    const leaferRef = useRef<LUI.App | null>(null);
    const editorRef = useRef<Editor | null>(null);
    const editorNodeMapRef = useRef(new Map<string, LUI.Rect>());
    const editorNodeIdRef = useRef(new WeakMap<LUI.Rect, string>());
    const nodeTextMapRef = useRef(new Map<string, LUI.Text>());
    const nodeLayoutSignatureRef = useRef(new Map<string, string>());
    const nodeTextSignatureRef = useRef(new Map<string, string>());
    const nodePaintSignatureRef = useRef(new Map<string, string>());
    const nodeInteractionSignatureRef = useRef(new Map<string, string>());
    const nodeMediaUrlRef = useRef(new Map<string, string>());
    const connectionVisualMapRef = useRef(new Map<string, LeaferConnectionVisual>());
    const hoveredNodeIdRef = useRef<string | null>(null);
    const draggingNodeIdsRef = useRef(new Set<string>());
    const backgroundCanvasRef = useRef<LUI.Canvas | null>(null);
    const backgroundSizeRef = useRef({ width: 0, height: 0 });
    const backgroundPatternKeyRef = useRef("");
    const backgroundPatternRef = useRef<CanvasPattern | null>(null);
    const verticalGuideRef = useRef<LUI.Line | null>(null);
    const horizontalGuideRef = useRef<LUI.Line | null>(null);
    const tempEdgeFlowPathRef = useRef<LUI.Path | null>(null);
    const tempEdgePathRef = useRef<LUI.Path | null>(null);
    const connectionFlowFrameRef = useRef<number | null>(null);
    const connectionFlowLastPaintRef = useRef(0);
    const readyFrameRef = useRef<number | null>(null);
    const readyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const readyReportedRef = useRef(false);
    const onReadyRef = useRef(onReady);
    onReadyRef.current = onReady;
    const viewportPresentationFrameRef = useRef<number | null>(null);
    const pendingViewportPresentationRef = useRef<{ viewport: ViewportTransform; syncLeafer: boolean } | null>(null);
    const editorTransformActiveRef = useRef(false);
    const editorTransformTypeRef = useRef<"move" | "scale" | null>(null);
    const nodeElementMapRef = useRef(new Map<string, HTMLElement>());
    const syncingEditorSelectionRef = useRef(false);
    const wheelCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [isSpacePressed, setIsSpacePressed] = useState(false);
    const selectionModifiersRef = useRef({ shiftKey: false, ctrlKey: false, metaKey: false });

    // Refs for all mutable props/state — prevents recreating event handlers (which causes infinite loops)
    const nodesRef = useRef(nodes); nodesRef.current = nodes;
    const connectionsRef = useRef(connections); connectionsRef.current = connections;
    const connectionsByNodeId = useMemo(() => {
        const index = new Map<string, CanvasConnection[]>();
        connections.forEach((connection) => {
            index.set(connection.fromNodeId, [...(index.get(connection.fromNodeId) || []), connection]);
            index.set(connection.toNodeId, [...(index.get(connection.toNodeId) || []), connection]);
        });
        return index;
    }, [connections]);
    const connectionsByNodeIdRef = useRef(connectionsByNodeId); connectionsByNodeIdRef.current = connectionsByNodeId;
    const nodeSpatialIndex = useMemo(
        () => buildSpatialIndex(nodes, (node) => ({
            left: node.position.x,
            top: node.position.y,
            right: node.position.x + node.width,
            bottom: node.position.y + node.height,
        })),
        [nodes],
    );
    const nodeSpatialIndexRef = useRef(nodeSpatialIndex); nodeSpatialIndexRef.current = nodeSpatialIndex;
    const selectedNodeIdsRef = useRef(selectedNodeIds); selectedNodeIdsRef.current = selectedNodeIds;
    const selectedConnectionIdRef = useRef(selectedConnectionId); selectedConnectionIdRef.current = selectedConnectionId;
    const relatedNodeIdsRef = useRef(relatedNodeIds ?? EMPTY_ID_SET); relatedNodeIdsRef.current = relatedNodeIds ?? EMPTY_ID_SET;
    const relatedConnectionIdsRef = useRef(relatedConnectionIds ?? EMPTY_ID_SET); relatedConnectionIdsRef.current = relatedConnectionIds ?? EMPTY_ID_SET;
    const connectingParamsRef = useRef(connectingParams); connectingParamsRef.current = connectingParams;
    const connectionStartCanvasPointRef = useRef<{ x: number; y: number } | null>(null);
    const connectionTargetNodeIdRef = useRef(connectionTargetNodeId); connectionTargetNodeIdRef.current = connectionTargetNodeId;
    const isSpacePressedRef = useRef(isSpacePressed); isSpacePressedRef.current = isSpacePressed;
    const connectStartScreenRef = useRef<{ x: number; y: number } | null>(null);
    const lastNodeDoubleTapAtRef = useRef(0);
    const callbacksRef = useRef({ onViewportChange, onViewportPresentation, onNodePointerDown, onNodeTap, onNodeDragStart, resolveNodeMove, onNodesTransform, onNodesTransformEnd, onNodeHoverChange, onNodeContextMenu, onCanvasMouseDown, onCanvasDeselect, onConnectStart, onConnectEnd, onConnect, onEdgeClick, onEdgeContextMenu, onDrop, onSelectionBox, onConnectionTargetChange, onContextMenu, onCanvasDoubleClick });
    callbacksRef.current = { onViewportChange, onViewportPresentation, onNodePointerDown, onNodeTap, onNodeDragStart, resolveNodeMove, onNodesTransform, onNodesTransformEnd, onNodeHoverChange, onNodeContextMenu, onCanvasMouseDown, onCanvasDeselect, onConnectStart, onConnectEnd, onConnect, onEdgeClick, onEdgeContextMenu, onDrop, onSelectionBox, onConnectionTargetChange, onContextMenu, onCanvasDoubleClick };

    // Drag state
    const dragRef = useRef<{
        type: "pan" | "select" | null;
        startScreenX: number;
        startScreenY: number;
        startViewportX: number;
        startViewportY: number;
        selectStartCanvas: { x: number; y: number };
        selectRect: { x: number; y: number; w: number; h: number } | null;
        selectionMode: 'replace' | 'add' | 'toggle';
        fromRightButton?: boolean;
    }>({
        type: null, startScreenX: 0, startScreenY: 0,
        startViewportX: 0, startViewportY: 0,
        selectStartCanvas: { x: 0, y: 0 }, selectRect: null, selectionMode: 'replace',
    });
    // 右键拖拽超过阈值后置位，用于抑制紧随其后的 contextmenu 菜单（画布/节点/连线三条路径）。
    const suppressContextMenuRef = useRef(false);

    const frozenTempEdgeRef = useRef<NonNullable<LeaferCanvasProps["pendingConnection"]>>(null);
    const previousPendingConnectionRef = useRef(pendingConnection ?? null);

    const syncEditorViewport = useCallback((next: ViewportTransform) => {
        const app = leaferRef.current;
        if (!app) return;
        app.tree.zoomLayer.set({ x: next.x, y: next.y, scaleX: next.k, scaleY: next.k });
    }, []);

    const drawBackground = useCallback((next: ViewportTransform) => {
        const background = backgroundCanvasRef.current;
        const container = containerRef.current;
        if (!background || !container) return;
        const width = Math.max(1, container.clientWidth);
        const height = Math.max(1, container.clientHeight);
        if (backgroundSizeRef.current.width !== width || backgroundSizeRef.current.height !== height) {
            backgroundSizeRef.current = { width, height };
            background.set({ width, height });
        }

        const context = background.context;
        context.clearRect(0, 0, width, height);
        context.fillStyle = themeRef.current.canvas.background;
        context.fillRect(0, 0, width, height);
        if (backgroundModeRef.current === "blank") {
            background.paint();
            return;
        }

        // 点阵/网格改为 pattern 瓦片渲染：低缩放下间距钳到 24px，且每帧只做一次
        // pattern 填充——k→0.1 时旧的逐 arc 绘制每帧有数万个路径点，是平移/缩放的 60fps 热点。
        const gap = Math.max(24, Math.round(56 * next.k));
        const offsetX = ((next.x % gap) + gap) % gap;
        const offsetY = ((next.y % gap) + gap) % gap;
        const patternKey = `${backgroundModeRef.current}|${gap}|${themeRef.current.canvas.dot}|${themeRef.current.canvas.line}`;
        if (backgroundPatternKeyRef.current !== patternKey) {
            backgroundPatternKeyRef.current = patternKey;
            backgroundPatternRef.current = buildBackgroundPattern(backgroundModeRef.current, gap, themeRef.current);
        }
        const pattern = backgroundPatternRef.current;
        if (pattern) {
            context.save();
            context.translate(offsetX, offsetY);
            context.fillStyle = pattern;
            context.fillRect(-offsetX, -offsetY, width + gap, height + gap);
            context.restore();
        }
        background.paint();
    }, [containerRef]);

    const syncSkyOverlays = useCallback((next: ViewportTransform) => {
        const container = containerRef.current;
        if (!container) return;
        const width = Math.max(1, container.clientWidth);
        const height = Math.max(1, container.clientHeight);
        const accent = themeRef.current.ui.accent;
        const vertical = verticalGuideRef.current;
        const horizontal = horizontalGuideRef.current;
        const verticalX = alignmentGuidesRef.current?.vertical;
        const horizontalY = alignmentGuidesRef.current?.horizontal;
        vertical?.set({
            points: verticalX === undefined ? [0, 0, 0, 0] : [next.x + verticalX * next.k, 0, next.x + verticalX * next.k, height],
            visible: verticalX !== undefined,
            stroke: accent,
        });
        horizontal?.set({
            points: horizontalY === undefined ? [0, 0, 0, 0] : [0, next.y + horizontalY * next.k, width, next.y + horizontalY * next.k],
            visible: horizontalY !== undefined,
            stroke: accent,
        });
    }, [containerRef]);

    const ensureConnectionFlowAnimation = useCallback(() => {
        if (connectionFlowFrameRef.current !== null) return;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const animate = (time: number) => {
            if (time - connectionFlowLastPaintRef.current < 32) {
                connectionFlowFrameRef.current = requestAnimationFrame(animate);
                return;
            }
            connectionFlowLastPaintRef.current = time;
            let hasVisibleFlow = false;
            const dash = themeRef.current.connection.dash;
            const offset = -((time * 0.25) % (dash[0] + dash[1]));
            connectionVisualMapRef.current.forEach((visual) => {
                visual.flow.forEach((path) => {
                    if (!path.visible) return;
                    hasVisibleFlow = true;
                    path.dashOffset = offset;
                });
            });
            const tempFlow = tempEdgeFlowPathRef.current;
            if (tempFlow?.visible) {
                hasVisibleFlow = true;
                tempFlow.dashOffset = offset;
            }
            connectionFlowFrameRef.current = hasVisibleFlow ? requestAnimationFrame(animate) : null;
        };
        connectionFlowFrameRef.current = requestAnimationFrame(animate);
    }, []);

    const updateConnectionVisualStyle = useCallback((connectionId: string) => {
        const visual = connectionVisualMapRef.current.get(connectionId);
        if (!visual) return;
        const selected = selectedConnectionIdRef.current === connectionId;
        const related = relatedConnectionIdsRef.current.has(connectionId);
        const styleSignature = `${selected}|${related}|${visual.hovered}|${theme.connection.color}|${theme.connection.activeColor}`;
        if (visual.styleSignature === styleSignature) return;
        visual.styleSignature = styleSignature;
        visual.line.set({
            stroke: theme.connection.color,
            strokeWidth: selected || related || visual.hovered ? theme.connection.activeWidth : theme.connection.width,
            opacity: selected ? 1 : related ? 0.94 : visual.hovered ? 0.96 : 0.86,
            dashPattern: undefined,
        });
        const flowCount = related || visual.hovered ? 1 : 0;
        const app = leaferRef.current;
        while (app && visual.flow.length < flowCount) {
            const flow = new LUI.Path({
                path: visual.path,
                fill: "",
                stroke: theme.connection.activeColor,
                strokeWidth: theme.connection.activeWidth,
                strokeCap: "round",
                dashPattern: [...theme.connection.dash],
                shadow: { x: 0, y: 0, blur: 8, spread: 1, color: withAlpha(theme.connection.activeColor, 0.62) },
                hittable: false,
                zIndex: 11,
            });
            visual.flow.push(flow);
            app.tree.add(flow);
        }
        visual.flow.forEach((flow, index) => {
            flow.set({
                path: visual.path,
                visible: index < flowCount,
                stroke: theme.connection.activeColor,
                strokeWidth: theme.connection.activeWidth,
                dashPattern: [...theme.connection.dash],
                shadow: { x: 0, y: 0, blur: 8, spread: 1, color: withAlpha(theme.connection.activeColor, 0.62) },
                opacity: selected ? 1 : related || visual.hovered ? 0.98 : 0.9,
            });
        });
        if (flowCount) ensureConnectionFlowAnimation();
    }, [ensureConnectionFlowAnimation, theme]);

    const getNodeElement = useCallback((nodeId: string) => {
        const cached = nodeElementMapRef.current.get(nodeId);
        if (cached?.isConnected) return cached;
        const element = containerRef.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(nodeId)}"]`);
        if (element) nodeElementMapRef.current.set(nodeId, element);
        else nodeElementMapRef.current.delete(nodeId);
        return element;
    }, [containerRef]);

    const refreshNodeInteractionVisual = useCallback((nodeId: string) => {
        const rect = editorNodeMapRef.current.get(nodeId);
        if (!rect) return;
        const selected = selectedNodeIdsRef.current.has(nodeId);
        const related = relatedNodeIdsRef.current.has(nodeId);
        const connectionTarget = connectionTargetNodeIdRef.current === nodeId;
        const hovered = hoveredNodeIdRef.current === nodeId;
        const dragging = draggingNodeIdsRef.current.has(nodeId);
        const currentTheme = themeRef.current;
        const signature = [
            selected,
            related,
            connectionTarget,
            hovered,
            dragging,
            currentTheme.canvas.background,
            currentTheme.ui.accent,
            currentTheme.ui.hairline,
        ].join("|");
        if (nodeInteractionSignatureRef.current.get(nodeId) === signature) return;
        nodeInteractionSignatureRef.current.set(nodeId, signature);
        applyNodeInteractionVisual(rect, themeRef.current, {
            selected,
            related,
            connectionTarget,
            hovered,
            dragging,
        });
        const element = getNodeElement(nodeId);
        if (element) {
            if (hoveredNodeIdRef.current === nodeId) element.dataset.nodeHovered = "true";
            else element.removeAttribute("data-node-hovered");
            if (draggingNodeIdsRef.current.has(nodeId)) element.dataset.nodeDragging = "true";
            else element.removeAttribute("data-node-dragging");
        }
    }, [getNodeElement]);

    const visibleImagesSettled = useCallback(() => {
        const container = containerRef.current;
        if (!container) return false;
        const width = container.clientWidth;
        const height = container.clientHeight;
        const currentViewport = viewportRef.current;
        return nodesRef.current.every((node) => {
            if (
                node.type !== CanvasNodeType.Image
                || (!node.metadata?.content && !node.metadata?.storageKey)
                || node.metadata?.status === "loading"
                || node.metadata?.status === "error"
            ) return true;
            const left = node.position.x * currentViewport.k + currentViewport.x;
            const top = node.position.y * currentViewport.k + currentViewport.y;
            const right = left + node.width * currentViewport.k;
            const bottom = top + node.height * currentViewport.k;
            if (right < 0 || bottom < 0 || left > width || top > height) return true;
            const element = container.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(node.id)}"]`);
            const state = element?.dataset.leaferImageReady;
            return state === "true" || state === "error";
        });
    }, [containerRef]);

    const reportCanvasReady = useCallback((force = false) => {
        if (readyReportedRef.current) return;
        if (!force && !visibleImagesSettled()) {
            if (readyTimeoutRef.current === null) {
                readyTimeoutRef.current = setTimeout(() => reportCanvasReady(true), CANVAS_READY_FALLBACK_MS);
            }
            return;
        }
        if (readyTimeoutRef.current !== null) {
            clearTimeout(readyTimeoutRef.current);
            readyTimeoutRef.current = null;
        }
        if (readyFrameRef.current !== null) return;
        readyFrameRef.current = requestAnimationFrame(() => {
            readyFrameRef.current = requestAnimationFrame(() => {
                readyFrameRef.current = null;
                if (readyReportedRef.current) return;
                readyReportedRef.current = true;
                onReadyRef.current?.();
            });
        });
    }, [visibleImagesSettled]);

    const flushViewportPresentation = useCallback(() => {
        viewportPresentationFrameRef.current = null;
        const pending = pendingViewportPresentationRef.current;
        pendingViewportPresentationRef.current = null;
        if (!pending) return;
        const next = pending.viewport;
        const viewportElement = viewportElementRef.current;
        if (viewportElement) {
            viewportElement.style.transform = viewportToCssTransform(next);
        }
        if (pending.syncLeafer) syncEditorViewport(next);
        callbacksRef.current.onViewportPresentation?.(next);
        const showLeaferText = next.k < 0.5;
        nodeTextMapRef.current.forEach((text, nodeId) => {
            const visible = showLeaferText && !selectedNodeIdsRef.current.has(nodeId);
            if (text.visible !== visible) text.visible = visible;
        });
        drawBackground(next);
        syncSkyOverlays(next);
    }, [drawBackground, syncEditorViewport, syncSkyOverlays]);

    const applyViewportPresentation = useCallback((next: ViewportTransform, syncLeafer = true) => {
        viewportRef.current = next;
        scaleRef.current = next.k;
        const pending = pendingViewportPresentationRef.current;
        pendingViewportPresentationRef.current = {
            viewport: next,
            syncLeafer: syncLeafer || Boolean(pending?.syncLeafer),
        };
        if (viewportPresentationFrameRef.current !== null) return;
        viewportPresentationFrameRef.current = requestAnimationFrame(flushViewportPresentation);
    }, [flushViewportPresentation]);

    const flushEditorTransform = useCallback((forceStateCommit = false) => {
        const editor = editorRef.current;
        if (!editor) return;
        const nodeMap = new Map(nodesRef.current.map((node) => [node.id, node]));
        const selectedIds = new Set<string>();
        const updates = editor.list.flatMap((rect) => {
            const id = editorNodeIdRef.current.get(rect as LUI.Rect);
            if (!id) return [];
            selectedIds.add(id);
            const nodeRect = rect as LUI.Rect;
            const update = {
                id,
                position: { x: nodeRect.x ?? 0, y: nodeRect.y ?? 0 },
                width: nodeRect.width ?? 0,
                height: nodeRect.height ?? 0,
            };
            const element = getNodeElement(id);
            if (element) {
                element.style.transform = `translate(${update.position.x}px, ${update.position.y}px)`;
                element.style.width = `${update.width}px`;
                element.style.height = `${update.height}px`;
            }
            nodeTextMapRef.current.get(id)?.set({
                x: update.position.x + 18,
                y: update.position.y + 28,
                width: Math.max(1, update.width - 36),
                height: Math.max(1, update.height - 48),
            });
            return [update];
        });
        if (editorTransformTypeRef.current === "move") {
            const updateById = new Map(updates.map((update) => [update.id, update]));
            for (const update of [...updates]) {
                const group = nodeMap.get(update.id);
                if (group?.type !== CanvasNodeType.Group) continue;
                const dx = update.position.x - group.position.x;
                const dy = update.position.y - group.position.y;
                for (const childId of group.metadata?.groupChildIds || []) {
                    if (selectedIds.has(childId) || updateById.has(childId)) continue;
                    const child = nodeMap.get(childId);
                    const childRect = editorNodeMapRef.current.get(childId);
                    if (!child || !childRect) continue;
                    childRect.set({ x: child.position.x + dx, y: child.position.y + dy });
                    const childUpdate = {
                        id: childId,
                        position: { x: childRect.x ?? 0, y: childRect.y ?? 0 },
                        width: childRect.width ?? 0,
                        height: childRect.height ?? 0,
                    };
                    const element = getNodeElement(childId);
                    if (element) element.style.transform = `translate(${childUpdate.position.x}px, ${childUpdate.position.y}px)`;
                    nodeTextMapRef.current.get(childId)?.set({
                        x: childUpdate.position.x + 18,
                        y: childUpdate.position.y + 28,
                        width: Math.max(1, childUpdate.width - 36),
                        height: Math.max(1, childUpdate.height - 48),
                    });
                    updates.push(childUpdate);
                    updateById.set(childId, childUpdate);
                }
            }
        }
        if (updates.length) {
            const movedNodeIds = new Set<string>();
            updates.forEach((update) => {
                const node = nodeMap.get(update.id);
                if (!node) return;
                movedNodeIds.add(update.id);
                nodeMap.set(update.id, {
                    ...node,
                    position: update.position,
                    width: update.width,
                    height: update.height,
                });
            });
            const affectedConnections = new Map<string, CanvasConnection>();
            movedNodeIds.forEach((nodeId) => {
                connectionsByNodeIdRef.current.get(nodeId)?.forEach((connection) => affectedConnections.set(connection.id, connection));
            });
            affectedConnections.forEach((connection) => {
                const points = getConnectionPoints(connection, nodeMap);
                if (!points) return;
                const path = buildConnectionPathFromPoints(points.from, points.to);
                const visual = connectionVisualMapRef.current.get(connection.id);
                if (!visual) return;
                visual.path = path;
                visual.hit.path = path;
                visual.line.path = path;
                visual.flow.forEach((flow) => (flow.path = path));
            });
        }
        // Leafer keeps the live DOM, editor rectangles, text overlays, and connection paths in sync.
        // React only needs the final snapshot; committing on every drag tick rerenders the whole canvas.
        if (updates.length && forceStateCommit) {
            callbacksRef.current.onNodesTransform?.(updates);
        }
    }, [getNodeElement]);

    const beginEditorTransform = useCallback((type: "move" | "scale") => {
        if (editorTransformActiveRef.current) return;
        const editor = editorRef.current;
        const anchor = editor?.list[0] as LUI.Rect | undefined;
        const anchorId = anchor ? editorNodeIdRef.current.get(anchor) : null;
        if (!editor || !anchorId) return;
        editorTransformActiveRef.current = true;
        editorTransformTypeRef.current = type;
        editor.list.forEach((item) => {
            const id = editorNodeIdRef.current.get(item as LUI.Rect);
            if (!id) return;
            draggingNodeIdsRef.current.add(id);
            refreshNodeInteractionVisual(id);
        });
        callbacksRef.current.onNodeDragStart?.(anchorId);
    }, [refreshNodeInteractionVisual]);

    const commitViewportChange = useCallback(() => {
        wheelCommitTimerRef.current = null;
        const next = viewportRef.current;
        if (sameViewport(committedViewportRef.current, next)) return;
        committedViewportRef.current = next;
        callbacksRef.current.onViewportChange(next);
    }, []);

    const scheduleViewportCommit = useCallback(() => {
        if (wheelCommitTimerRef.current) clearTimeout(wheelCommitTimerRef.current);
        wheelCommitTimerRef.current = setTimeout(commitViewportChange, 100);
    }, [commitViewportChange]);

    const presentLeaferViewport = useCallback(() => {
        const zoomLayer = leaferRef.current?.tree.zoomLayer;
        if (!zoomLayer) return;
        const next = { x: zoomLayer.x ?? 0, y: zoomLayer.y ?? 0, k: zoomLayer.scaleX ?? 1 };
        if (sameViewport(viewportRef.current, next)) return;
        applyViewportPresentation(next, false);
        scheduleViewportCommit();
    }, [applyViewportPresentation, scheduleViewportCommit]);

    // Init LeaferJS
    useEffect(() => {
        const container = leaferContainerRef.current;
        if (!container) return;
        const app = new LUI.App({
            view: container,
            start: true,
            ground: { type: "draw", usePartRender: false, hittable: false },
            tree: { type: "design", usePartRender: true, usePartLayout: true },
            sky: { type: "draw", usePartRender: false },
            editor: {
                selector: true,
                boxSelect: true,
                hover: true,
                select: "press",
                moveable: true,
                resizeable: true,
                rotateable: false,
                skewable: false,
                flipable: false,
                lockRatio: "corner",
                stroke: themeRef.current.ui.accent,
                strokeWidth: 1.5,
                pointFill: themeRef.current.node.panel,
                pointSize: 9,
                pointRadius: 14,
                // 仅保留四角缩放点；四边透明 resizeLine 继续支持单边拉伸。
                hideRotatePoints: true,
                hideResizeLines: false,
                keyEvent: true,
                multipleSelectKey: (event) => Boolean(event.shiftKey || event.ctrlKey || event.metaKey),
                beforeMove: ({ x, y }) => {
                    beginEditorTransform("move");
                    const editor = editorRef.current;
                    const anchor = editor?.list[0] as LUI.Rect | undefined;
                    const anchorId = anchor ? editorNodeIdRef.current.get(anchor) : null;
                    if (!anchor || !anchorId) return;
                    const anchorX = anchor.x ?? 0;
                    const anchorY = anchor.y ?? 0;
                    const resolved = callbacksRef.current.resolveNodeMove?.(anchorId, {
                        x: anchorX + x,
                        y: anchorY + y,
                    });
                    return resolved ? { x: resolved.x - anchorX, y: resolved.y - anchorY } : undefined;
                },
                beforeScale: () => {
                    beginEditorTransform("scale");
                },
            },
            wheel: {
                zoomMode: false,
                preventDefault: true,
                // TapNow 契约：普通滚轮/触控板双指 = 平移（getScale 返回 1 时 Leafer 走 move 分支），
                // Ctrl/Cmd + 滚轮或触控板捏合（浏览器上报为 ctrlKey wheel）= 以指针为锚点缩放。
                getScale: (event) => {
                    if (!event.ctrlKey && !event.metaKey) return 1;
                    const delta = event.deltaY || event.deltaX;
                    if (!delta) return 1;
                    const current = viewportRef.current.k;
                    const next = stepCanvasZoom(current, delta < 0 ? "in" : "out");
                    return next / current;
                },
            },
            zoom: { min: MIN_CANVAS_ZOOM, max: MAX_CANVAS_ZOOM },
            move: {
                holdSpaceKey: true,
                holdMiddleKey: true,
                dragOut: 32,
                autoDistance: 3,
            },
        });
        const editor = app.editor as Editor;
        leaferRef.current = app;
        editorRef.current = editor;
        syncEditorViewport(viewportRef.current);

        const background = new LUI.Canvas({
            width: Math.max(1, container.clientWidth),
            height: Math.max(1, container.clientHeight),
            hittable: false,
        });
        backgroundCanvasRef.current = background;
        app.ground.add(background);

        const verticalGuide = new LUI.Line({
            points: [0, 0, 0, 0],
            visible: false,
            stroke: themeRef.current.ui.accent,
            strokeWidth: 1,
            dashPattern: [5, 5],
            hittable: false,
        });
        const horizontalGuide = new LUI.Line({
            points: [0, 0, 0, 0],
            visible: false,
            stroke: themeRef.current.ui.accent,
            strokeWidth: 1,
            dashPattern: [5, 5],
            hittable: false,
        });
        const tempEdgeFlow = new LUI.Path({
            path: "",
            visible: false,
            fill: "",
            stroke: themeRef.current.connection.activeColor,
            strokeWidth: themeRef.current.connection.activeWidth,
            strokeCap: "round",
            dashPattern: [...themeRef.current.connection.dash],
            opacity: 0.94,
            shadow: { x: 0, y: 0, blur: 8, spread: 1, color: withAlpha(themeRef.current.connection.activeColor, 0.62) },
            hittable: false,
        });
        const tempEdge = new LUI.Path({
            path: "",
            visible: false,
            fill: "",
            stroke: themeRef.current.connection.color,
            strokeWidth: themeRef.current.connection.tempWidth,
            strokeCap: "round",
            hittable: false,
        });
        verticalGuideRef.current = verticalGuide;
        horizontalGuideRef.current = horizontalGuide;
        tempEdgeFlowPathRef.current = tempEdgeFlow;
        tempEdgePathRef.current = tempEdge;
        app.sky.addAt(tempEdgeFlow, 1);
        app.sky.addAt(tempEdge, 0);
        app.sky.addAt(horizontalGuide, 0);
        app.sky.addAt(verticalGuide, 0);
        drawBackground(viewportRef.current);
        syncSkyOverlays(viewportRef.current);

        const resizeObserver = new ResizeObserver(() => {
            drawBackground(viewportRef.current);
            syncSkyOverlays(viewportRef.current);
        });
        resizeObserver.observe(container);

        const handleEditorSelect = (event: EditorEvent) => {
            if (syncingEditorSelectionRef.current) return;
            const ids = event.list
                .map((item) => editorNodeIdRef.current.get(item as LUI.Rect))
                .filter((id): id is string => Boolean(id));
            callbacksRef.current.onSelectionBox?.(ids, "replace");
        };
        const handleEditorTransform = () => flushEditorTransform();
        editor.on(EditorEvent.SELECT, handleEditorSelect);
        editor.on(EditorMoveEvent.MOVE, handleEditorTransform);
        editor.on(EditorScaleEvent.SCALE, handleEditorTransform);
        app.tree.on(LUI.MoveEvent.MOVE, presentLeaferViewport);
        app.tree.on(LUI.ZoomEvent.ZOOM, presentLeaferViewport);
        const finishTransform = () => {
            if (!editorTransformActiveRef.current) return;
            editorTransformActiveRef.current = false;
            flushEditorTransform(true);
            editorTransformTypeRef.current = null;
            const draggingIds = Array.from(draggingNodeIdsRef.current);
            draggingNodeIdsRef.current.clear();
            draggingIds.forEach(refreshNodeInteractionVisual);
            callbacksRef.current.onNodesTransformEnd?.();
        };
        window.addEventListener("pointerup", finishTransform);
        window.addEventListener("pointercancel", finishTransform);
        window.addEventListener("blur", finishTransform);
        // 拖拽中关闭标签页时 pointerup/blur 不触发，pagehide 里提交拖拽位置，
        // 使父组件 pagehide flush 能持久化最终坐标。
        window.addEventListener("pagehide", finishTransform);

        return () => {
            resizeObserver.disconnect();
            window.removeEventListener("pointerup", finishTransform);
            window.removeEventListener("pointercancel", finishTransform);
            window.removeEventListener("blur", finishTransform);
            window.removeEventListener("pagehide", finishTransform);
            if (connectionFlowFrameRef.current !== null) cancelAnimationFrame(connectionFlowFrameRef.current);
            connectionFlowFrameRef.current = null;
            connectionFlowLastPaintRef.current = 0;
            if (readyFrameRef.current !== null) cancelAnimationFrame(readyFrameRef.current);
            readyFrameRef.current = null;
            if (readyTimeoutRef.current !== null) clearTimeout(readyTimeoutRef.current);
            readyTimeoutRef.current = null;
            readyReportedRef.current = false;
            if (viewportPresentationFrameRef.current !== null) cancelAnimationFrame(viewportPresentationFrameRef.current);
            viewportPresentationFrameRef.current = null;
            pendingViewportPresentationRef.current = null;
            editorTransformTypeRef.current = null;
            editorNodeMapRef.current.clear();
            hoveredNodeIdRef.current = null;
            draggingNodeIdsRef.current.clear();
            nodeTextMapRef.current.clear();
            nodeLayoutSignatureRef.current.clear();
            nodeTextSignatureRef.current.clear();
            nodePaintSignatureRef.current.clear();
            nodeInteractionSignatureRef.current.clear();
            nodeMediaUrlRef.current.clear();
            nodeElementMapRef.current.clear();
            connectionVisualMapRef.current.clear();
            backgroundCanvasRef.current = null;
            backgroundPatternRef.current = null;
            backgroundPatternKeyRef.current = "";
            verticalGuideRef.current = null;
            horizontalGuideRef.current = null;
            tempEdgeFlowPathRef.current = null;
            tempEdgePathRef.current = null;
            app.destroy();
            leaferRef.current = null;
            editorRef.current = null;
        };
    }, [beginEditorTransform, drawBackground, flushEditorTransform, getNodeElement, presentLeaferViewport, refreshNodeInteractionVisual, reportCanvasReady, syncEditorViewport, syncSkyOverlays]);

    useEffect(() => {
        const app = leaferRef.current;
        const editor = editorRef.current;
        if (!app || !editor) return;
        const currentIds = new Set(nodes.map((node) => node.id));
        editorNodeMapRef.current.forEach((rect, id) => {
            if (currentIds.has(id)) return;
            if (editor.hasItem(rect)) editor.removeItem(rect);
            rect.remove();
            editorNodeMapRef.current.delete(id);
            if (hoveredNodeIdRef.current === id) hoveredNodeIdRef.current = null;
            draggingNodeIdsRef.current.delete(id);
            nodeTextMapRef.current.get(id)?.remove();
            nodeTextMapRef.current.delete(id);
            nodeLayoutSignatureRef.current.delete(id);
            nodeTextSignatureRef.current.delete(id);
            nodePaintSignatureRef.current.delete(id);
            nodeInteractionSignatureRef.current.delete(id);
            nodeMediaUrlRef.current.delete(id);
            nodeElementMapRef.current.delete(id);
            const element = getNodeElement(id);
            element?.removeAttribute("data-leafer-image-ready");
        });

        nodes.forEach((node) => {
            let rect = editorNodeMapRef.current.get(node.id);
            if (!rect) {
                rect = new LUI.Rect({
                    x: node.position.x,
                    y: node.position.y,
                    width: node.width,
                    height: node.height,
                    fill: theme.node.panel,
                    hitFill: "all",
                    editable: true,
                    cursor: "move",
                    cornerRadius: CANVAS_NODE_RADIUS,
                });
                editorNodeMapRef.current.set(node.id, rect);
                editorNodeIdRef.current.set(rect, node.id);
                rect.on(LUI.PointerEvent.DOWN, (event: LUI.PointerEvent) => {
                    callbacksRef.current.onNodePointerDown?.(node.id, {
                        shiftKey: Boolean(event.shiftKey),
                        ctrlKey: Boolean(event.ctrlKey),
                        metaKey: Boolean(event.metaKey),
                    });
                });
                rect.on(LUI.PointerEvent.TAP, () => callbacksRef.current.onNodeTap?.(node.id));
                rect.on(LUI.PointerEvent.DOUBLE_TAP, () => {
                    lastNodeDoubleTapAtRef.current = Date.now();
                    const element = containerRef.current?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(node.id)}"] .creative-os-node`);
                    element?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
                });
                rect.on(LUI.PointerEvent.ENTER, () => {
                    const previousId = hoveredNodeIdRef.current;
                    hoveredNodeIdRef.current = node.id;
                    if (previousId && previousId !== node.id) refreshNodeInteractionVisual(previousId);
                    refreshNodeInteractionVisual(node.id);
                    callbacksRef.current.onNodeHoverChange?.(node.id);
                });
                rect.on(LUI.PointerEvent.LEAVE, () => {
                    const wasHovered = hoveredNodeIdRef.current === node.id;
                    if (wasHovered) hoveredNodeIdRef.current = null;
                    refreshNodeInteractionVisual(node.id);
                    if (wasHovered) callbacksRef.current.onNodeHoverChange?.(null);
                });
                rect.on(LUI.PointerEvent.MENU, (event: LUI.PointerEvent) => {
                    if (suppressContextMenuRef.current) {
                        suppressContextMenuRef.current = false;
                        return;
                    }
                    const pagePoint = event.getPagePoint();
                    const bounds = containerRef.current?.getBoundingClientRect();
                    if (!bounds) return;
                    callbacksRef.current.onNodeContextMenu?.(node.id, bounds.left + pagePoint.x, bounds.top + pagePoint.y);
                });
                rect.on(LUI.ImageEvent.LOAD, () => markLeaferImageReady(containerRef.current, node.id, false));
                rect.on(LUI.ImageEvent.LOADED, () => {
                    markLeaferImageReady(containerRef.current, node.id, true);
                    reportCanvasReady();
                });
                rect.on(LUI.ImageEvent.ERROR, () => {
                    markLeaferImageReady(containerRef.current, node.id, "error");
                    reportCanvasReady();
                });
                app.tree.add(rect);
            }
            const bounds = editorBounds(node);
            const selected = selectedNodeIdsRef.current.has(node.id);
            const related = relatedNodeIdsRef.current.has(node.id);
            const connectionTarget = connectionTargetNodeIdRef.current === node.id;
            const active = selected || connectionTarget;
            const hovered = hoveredNodeIdRef.current === node.id;
            const dragging = draggingNodeIdsRef.current.has(node.id);
            const mediaUrl = nodeMediaUrlRef.current.get(node.id);
            const paintSignature = [
                node.type,
                node.metadata?.status,
                mediaUrl,
                active,
                related,
                hovered,
                dragging,
                theme.node.panel,
                theme.ui.controlFill,
                theme.ui.accent,
                theme.ui.hairline,
            ].join("|");
            const paintChanged = nodePaintSignatureRef.current.get(node.id) !== paintSignature;
            if (paintChanged) nodePaintSignatureRef.current.set(node.id, paintSignature);
            const layoutSignature = [
                node.position.x,
                node.position.y,
                node.width,
                node.height,
                node.type,
                bounds.minWidth,
                bounds.maxWidth,
                bounds.minHeight,
                bounds.maxHeight,
                bounds.lockRatio,
            ].join("|");
            const layoutChanged = nodeLayoutSignatureRef.current.get(node.id) !== layoutSignature;
            if (layoutChanged) nodeLayoutSignatureRef.current.set(node.id, layoutSignature);
            if (paintChanged || layoutChanged) {
                rect.set({
                    x: node.position.x,
                    y: node.position.y,
                    width: node.width,
                    height: node.height,
                    visible: node.type !== CanvasNodeType.Group || node.width > 0,
                    zIndex: node.type === CanvasNodeType.Group ? 0 : 20,
                    cornerRadius: CANVAS_NODE_RADIUS,
                    fill: paintChanged ? getNodeLeaferFill(node, theme, mediaUrl) : rect.fill,
                    widthRange: { min: bounds.minWidth, max: bounds.maxWidth },
                    heightRange: { min: bounds.minHeight, max: bounds.maxHeight },
                    editConfig: {
                        lockRatio: bounds.lockRatio,
                        rotateable: false,
                        skewable: false,
                        flipable: false,
                    },
                });
            }
            refreshNodeInteractionVisual(node.id);

            const text = getNodeLeaferText(node);
            let textVisual = nodeTextMapRef.current.get(node.id);
            if (text) {
                if (!textVisual) {
                    textVisual = new LUI.Text({ hittable: false, zIndex: 21 });
                    nodeTextMapRef.current.set(node.id, textVisual);
                    app.tree.add(textVisual);
                }
                const fontSize = Math.max(10, node.metadata?.fontSize || 14);
                const textSignature = [
                    node.position.x,
                    node.position.y,
                    node.width,
                    node.height,
                    text,
                    theme.node.text,
                    fontSize,
                    viewportRef.current.k < 0.5 && !selected,
                ].join("|");
                if (nodeTextSignatureRef.current.get(node.id) !== textSignature) {
                    nodeTextSignatureRef.current.set(node.id, textSignature);
                    textVisual.set({
                        x: node.position.x + 18,
                        y: node.position.y + 28,
                        width: Math.max(1, node.width - 36),
                        height: Math.max(1, node.height - 48),
                        text,
                        fill: theme.node.text,
                        fontSize,
                        lineHeight: Math.round(fontSize * 1.72),
                        textWrap: "break",
                        textOverflow: "hide",
                        visible: viewportRef.current.k < 0.5 && !selected,
                        zIndex: 21,
                    });
                }
            } else if (textVisual) {
                textVisual.remove();
                nodeTextMapRef.current.delete(node.id);
                nodeTextSignatureRef.current.delete(node.id);
            }
        });
        editor.update();
        reportCanvasReady();
    }, [connectionTargetNodeId, containerRef, getNodeElement, nodes, refreshNodeInteractionVisual, relatedNodeIds, reportCanvasReady, selectedNodeIds, theme]);

    useEffect(() => {
        let cancelled = false;
        const imageNodes = nodes.filter((node) => node.type === CanvasNodeType.Image);
        const activeIds = new Set(imageNodes.map((node) => node.id));
        nodeMediaUrlRef.current.forEach((_url, id) => {
            if (!activeIds.has(id)) nodeMediaUrlRef.current.delete(id);
        });

        imageNodes.forEach((node) => {
            if (node.metadata?.status === "loading" || node.metadata?.status === "error") {
                markLeaferImageReady(containerRef.current, node.id, false);
                return;
            }
            const storageKey = node.metadata?.storageKey;
            const content = node.metadata?.content;
            const cached = storageKey ? peekImageThumbnailUrl(storageKey) : content;
            if (cached) {
                applyResolvedNodeImage(node, cached);
                return;
            }
            if (!storageKey) {
                markLeaferImageReady(containerRef.current, node.id, false);
                return;
            }
            resolveImageThumbnailUrl(storageKey, content?.startsWith("blob:") ? "" : (content || ""))
                .then((url) => {
                    if (!cancelled && url) applyResolvedNodeImage(node, url);
                })
                .catch(() => {
                    if (!cancelled) {
                        markLeaferImageReady(containerRef.current, node.id, "error");
                        reportCanvasReady();
                    }
                });
        });

        function applyResolvedNodeImage(node: CanvasNodeData, url: string) {
            const rect = editorNodeMapRef.current.get(node.id);
            if (!rect) return;
            const previousUrl = nodeMediaUrlRef.current.get(node.id);
            if (previousUrl !== url) {
                nodeMediaUrlRef.current.set(node.id, url);
                nodePaintSignatureRef.current.delete(node.id);
                markLeaferImageReady(containerRef.current, node.id, false);
                rect.set({ fill: getNodeLeaferFill(node, themeRef.current, url) });
            }
        }

        return () => {
            cancelled = true;
        };
    }, [containerRef, nodes, reportCanvasReady]);

    useEffect(() => {
        const app = leaferRef.current;
        if (!app) return;
        const nodeMap = new Map(nodes.map((node) => [node.id, node]));
        const currentIds = new Set(connections.map((connection) => connection.id));

        connectionVisualMapRef.current.forEach((visual, id) => {
            if (currentIds.has(id)) return;
            visual.hit.remove();
            visual.line.remove();
            visual.flow.forEach((flow) => flow.remove());
            connectionVisualMapRef.current.delete(id);
        });

        connections.forEach((connection) => {
            const points = getConnectionPoints(connection, nodeMap);
            if (!points) return;
            const path = buildConnectionPathFromPoints(points.from, points.to);
            let visual = connectionVisualMapRef.current.get(connection.id);
            if (!visual) {
                const hit = new LUI.Path({
                    path,
                    fill: "",
                    stroke: "#000",
                    strokeWidth: 20,
                    opacity: 0.001,
                    hitStroke: "all",
                    cursor: "pointer",
                    zIndex: 9,
                });
                const line = new LUI.Path({
                    path,
                    fill: "",
                    stroke: themeRef.current.connection.color,
                    strokeWidth: 2.4,
                    strokeCap: "round",
                    opacity: 0.78,
                    hittable: false,
                    zIndex: 10,
                });
                visual = { hit, line, flow: [], hovered: false, path, styleSignature: "" };
                connectionVisualMapRef.current.set(connection.id, visual);
                hit.on(LUI.PointerEvent.TAP, () => callbacksRef.current.onEdgeClick?.(connection.id));
                hit.on(LUI.PointerEvent.ENTER, () => {
                    const current = connectionVisualMapRef.current.get(connection.id);
                    if (!current) return;
                    current.hovered = true;
                    updateConnectionVisualStyle(connection.id);
                });
                hit.on(LUI.PointerEvent.LEAVE, () => {
                    const current = connectionVisualMapRef.current.get(connection.id);
                    if (!current) return;
                    current.hovered = false;
                    updateConnectionVisualStyle(connection.id);
                });
                hit.on(LUI.PointerEvent.MENU, (event: LUI.PointerEvent) => {
                    if (suppressContextMenuRef.current) {
                        suppressContextMenuRef.current = false;
                        return;
                    }
                    const pagePoint = event.getPagePoint();
                    const bounds = containerRef.current?.getBoundingClientRect();
                    if (!bounds) return;
                    callbacksRef.current.onEdgeContextMenu?.(connection.id, bounds.left + pagePoint.x, bounds.top + pagePoint.y);
                });
                app.tree.add(hit);
                app.tree.add(line);
            } else if (visual.path !== path) {
                visual.path = path;
                visual.hit.path = path;
                visual.line.path = path;
                visual.flow.forEach((flow) => (flow.path = path));
            }
            updateConnectionVisualStyle(connection.id);
        });
    }, [connections, containerRef, nodes, relatedConnectionIds, selectedConnectionId, updateConnectionVisualStyle]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        const targets = Array.from(selectedNodeIds)
            .map((id) => editorNodeMapRef.current.get(id))
            .filter((rect): rect is LUI.Rect => Boolean(rect));
        syncingEditorSelectionRef.current = true;
        if (!targets.length) editor.cancel();
        else editor.select(targets.length === 1 ? targets[0] : targets);
        syncingEditorSelectionRef.current = false;
    }, [selectedNodeIds]);

    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        editor.config.stroke = theme.ui.accent;
        editor.config.pointFill = theme.node.panel;
        editor.update();
        tempEdgeFlowPathRef.current?.set({
            stroke: theme.connection.activeColor,
            strokeWidth: theme.connection.activeWidth,
            dashPattern: [...theme.connection.dash],
            shadow: { x: 0, y: 0, blur: 8, spread: 1, color: withAlpha(theme.connection.activeColor, 0.62) },
        });
        tempEdgePathRef.current?.set({
            stroke: theme.connection.color,
            strokeWidth: theme.connection.tempWidth,
            dashPattern: undefined,
            shadow: undefined,
        });
    }, [theme]);

    useEffect(() => {
        drawBackground(viewportRef.current);
        syncSkyOverlays(viewportRef.current);
    }, [alignmentGuides, backgroundMode, drawBackground, syncSkyOverlays, theme]);

    // Viewport sync
    useEffect(() => {
        const container = containerRef.current;
        const next = clampViewport(viewport, container?.clientWidth || 0, container?.clientHeight || 0);
        committedViewportRef.current = next;
        applyViewportPresentation(next);
        if (!sameViewport(viewport, next)) callbacksRef.current.onViewportChange(next);
    }, [applyViewportPresentation, viewport]);

    useEffect(() => () => {
        if (wheelCommitTimerRef.current) clearTimeout(wheelCommitTimerRef.current);
    }, []);

    // Keyboard
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            selectionModifiersRef.current = {
                shiftKey: e.shiftKey,
                ctrlKey: e.ctrlKey,
                metaKey: e.metaKey,
            };
            if (e.code === "Space" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target instanceof HTMLElement && e.target.isContentEditable))) {
                e.preventDefault();
                isSpacePressedRef.current = true;
                setIsSpacePressed(true);
            }
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            selectionModifiersRef.current = {
                shiftKey: e.shiftKey,
                ctrlKey: e.ctrlKey,
                metaKey: e.metaKey,
            };
            if (e.code === "Space") {
                isSpacePressedRef.current = false;
                setIsSpacePressed(false);
            }
        };
        const handleBlur = () => {
            selectionModifiersRef.current = { shiftKey: false, ctrlKey: false, metaKey: false };
            isSpacePressedRef.current = false;
            setIsSpacePressed(false);
        };
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        window.addEventListener("blur", handleBlur);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            window.removeEventListener("blur", handleBlur);
        };
    }, []);

    const getCanvasPos = useCallback((clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect() ?? null;
        if (!rect) return { x: 0, y: 0 };
        return screenToCanvas(clientX, clientY, rect, viewportRef.current);
    }, [containerRef]);

    const renderTempEdgeAtCanvasPoint = useCallback((connection: { nodeId: string; handleType: "source" | "target" }, pointerCanvasPoint: { x: number; y: number }) => {
        const path = tempEdgePathRef.current;
        const flowPath = tempEdgeFlowPathRef.current;
        const node = nodesRef.current.find((item) => item.id === connection.nodeId);
        if (!path || !flowPath || !node) return;

        const fixedCanvasPoint = connectionStartCanvasPointRef.current ?? getNodeConnectionPoint(node, connection.handleType);
        const fixedScreenPoint = canvasToScreen(fixedCanvasPoint.x, fixedCanvasPoint.y, viewportRef.current);
        const pointerScreenPoint = canvasToScreen(pointerCanvasPoint.x, pointerCanvasPoint.y, viewportRef.current);
        const sourcePoint = connection.handleType === "source" ? fixedScreenPoint : pointerScreenPoint;
        const targetPoint = connection.handleType === "source" ? pointerScreenPoint : fixedScreenPoint;

        const connectionPath = buildConnectionPathFromPoints(sourcePoint, targetPoint);
        flowPath.set({
            path: connectionPath,
            visible: true,
        });
        path.set({
            path: connectionPath,
            visible: true,
        });
        ensureConnectionFlowAnimation();
    }, [ensureConnectionFlowAnimation]);

    const renderTempEdge = useCallback((connection: { nodeId: string; handleType: "source" | "target" }, clientX: number, clientY: number) => {
        renderTempEdgeAtCanvasPoint(connection, getCanvasPos(clientX, clientY));
    }, [getCanvasPos, renderTempEdgeAtCanvasPoint]);

    const findConnectionSnapTarget = useCallback((connection: { nodeId: string; handleType: "source" | "target" }, clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return null;
        const pointer = { x: clientX - rect.left, y: clientY - rect.top };
        const targetSide = connection.handleType === "source" ? "target" : "source";
        const currentTargetId = connectionTargetNodeIdRef.current;
        const canvasPointer = screenToCanvas(clientX, clientY, rect, viewportRef.current);
        const queryRadius = CONNECTION_SNAP_RELEASE_RADIUS / viewportRef.current.k;
        const candidates = querySpatialIndex(nodeSpatialIndexRef.current, {
            left: canvasPointer.x - queryRadius,
            top: canvasPointer.y - queryRadius,
            right: canvasPointer.x + queryRadius,
            bottom: canvasPointer.y + queryRadius,
        });
        let nearest: { node: CanvasNodeData; distance: number } | null = null;

        for (const { item: node } of candidates) {
            if (node.id === connection.nodeId || node.type === CanvasNodeType.Group) continue;
            if (targetSide === "source" && (node.type === CanvasNodeType.Config || node.type === CanvasNodeType.ComfyUI)) continue;
            const canvasPoint = getNodeConnectionPoint(node, targetSide);
            const screenPoint = canvasToScreen(canvasPoint.x, canvasPoint.y, viewportRef.current);
            const distance = Math.hypot(pointer.x - screenPoint.x, pointer.y - screenPoint.y);
            const radius = node.id === currentTargetId ? CONNECTION_SNAP_RELEASE_RADIUS : CONNECTION_SNAP_RADIUS;
            if (distance <= radius && (!nearest || distance < nearest.distance)) nearest = { node, distance };
        }

        return nearest ? { nodeId: nearest.node.id, position: getNodeConnectionPoint(nearest.node, targetSide) } : null;
    }, [containerRef]);

    const clearTempEdge = useCallback(() => {
        const path = tempEdgePathRef.current;
        const flowPath = tempEdgeFlowPathRef.current;
        path?.set({ visible: false, path: "" });
        flowPath?.set({ visible: false, path: "" });
    }, []);

    useEffect(() => {
        const hadPendingConnection = previousPendingConnectionRef.current !== null;
        previousPendingConnectionRef.current = pendingConnection ?? null;

        if (pendingConnection) {
            frozenTempEdgeRef.current = pendingConnection;
            renderTempEdgeAtCanvasPoint(pendingConnection.connection, pendingConnection.position);
            return;
        }
        if (connectingParams) {
            frozenTempEdgeRef.current = null;
            return;
        }
        if (hadPendingConnection) {
            frozenTempEdgeRef.current = null;
            clearTempEdge();
            return;
        }
        if (frozenTempEdgeRef.current) {
            renderTempEdgeAtCanvasPoint(frozenTempEdgeRef.current.connection, frozenTempEdgeRef.current.position);
            return;
        }
        clearTempEdge();
    }, [clearTempEdge, connectingParams, nodes, pendingConnection, renderTempEdgeAtCanvasPoint, viewport.k, viewport.x, viewport.y]);

    // --- Event handlers use refs, never depend on changing state ---
    const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const target = event.target as HTMLElement;
        if (target.closest("[data-canvas-no-zoom],.canvas-no-zoom-popup,[data-connection-create-menu]")) return;

        const isNode = !!target.closest("[data-node-id]");
        const isHandle = !!target.closest("[data-handle]");
        const isEdge = !!target.closest("[data-connection-id]");
        const isTextEditableContent = !!target.closest("[data-node-text-editable]");
        const cb = callbacksRef.current;

        // 右键拖拽平移（TapNow/Figma 契约）：任意位置右键按下即进入 pan，
        // 位移超过 6px 置 suppressContextMenuRef，短按抬起仍正常出菜单。
        if (event.button === 2) {
            dragRef.current = {
                type: "pan",
                fromRightButton: true,
                startScreenX: event.clientX, startScreenY: event.clientY,
                startViewportX: viewportRef.current.x, startViewportY: viewportRef.current.y,
                selectStartCanvas: getCanvasPos(event.clientX, event.clientY),
                selectRect: null,
                selectionMode: "replace",
            };
            event.currentTarget.setPointerCapture?.(event.pointerId);
            event.preventDefault();
            document.body.style.userSelect = "none";
            return;
        }

        // Leafer owns hit testing, selection, box selection, node transforms and viewport gestures.
        if (target.closest("[data-leafer-editor-layer]")) return;

        const shouldPanFromPointer = event.button === 1 || (event.button === 0 && isSpacePressedRef.current);
        if (shouldPanFromPointer && !isHandle) {
            dragRef.current = {
                type: "pan",
                startScreenX: event.clientX, startScreenY: event.clientY,
                startViewportX: viewportRef.current.x, startViewportY: viewportRef.current.y,
                selectStartCanvas: getCanvasPos(event.clientX, event.clientY),
                selectRect: null,
                selectionMode: "replace",
            };
            event.currentTarget.setPointerCapture?.(event.pointerId);
            event.preventDefault();
            document.body.style.userSelect = "none";
            return;
        }

        if (isHandle && !connectingParamsRef.current) {
            const handleEl = target.closest("[data-handle]") as HTMLElement;
            const nodeEl = target.closest("[data-node-id]") as HTMLElement;
            const handleType = handleEl?.dataset.handleType as "source" | "target";
            const nodeId = nodeEl?.dataset.nodeId;
            if (handleType && nodeId) {
                const nextConnection = { nodeId, handleType };
                frozenTempEdgeRef.current = null;
                connectingParamsRef.current = nextConnection;
                connectStartScreenRef.current = { x: event.clientX, y: event.clientY };
                const dotRect = handleEl.querySelector<HTMLElement>(".canvas-node-connection-dot")?.getBoundingClientRect();
                connectionStartCanvasPointRef.current = dotRect
                    ? getCanvasPos(dotRect.left + dotRect.width / 2, dotRect.top + dotRect.height / 2)
                    : getCanvasPos(event.clientX, event.clientY);
                cb.onConnectStart?.(nodeId, handleType);
                renderTempEdge(nextConnection, event.clientX, event.clientY);
                event.currentTarget.setPointerCapture?.(event.pointerId);
                event.preventDefault();
                return;
            }
        }

        if (isNode && !isHandle && event.button === 0) {
            const nodeEl = target.closest("[data-node-id]") as HTMLElement;
            const nodeId = nodeEl?.dataset.nodeId;
            if (nodeId) {
                const trackedModifiers = selectionModifiersRef.current;
                cb.onNodePointerDown?.(nodeId, {
                    shiftKey: event.shiftKey || trackedModifiers.shiftKey,
                    ctrlKey: event.ctrlKey || trackedModifiers.ctrlKey,
                    metaKey: event.metaKey || trackedModifiers.metaKey,
                });
                // Interactive DOM content remains in React; geometry always stays in Leafer.
                if (isTextEditableContent) return;
                return;
            }
        }

        if (isEdge) {
            const edgeEl = target.closest("[data-connection-id]") as HTMLElement;
            cb.onEdgeClick?.(edgeEl?.dataset.connectionId || "");
            return;
        }

        if (!isNode && !isHandle && !isEdge) {
            if (event.button === 0 || event.button === 1) {
                const trackedModifiers = selectionModifiersRef.current;
                const toggleSelection = event.ctrlKey || event.metaKey || trackedModifiers.ctrlKey || trackedModifiers.metaKey;
                const addSelection = event.shiftKey || trackedModifiers.shiftKey;
                const selectionMode = toggleSelection ? 'toggle' : addSelection ? 'add' : 'replace';
                dragRef.current = {
                    type: 'select',
                    startScreenX: event.clientX, startScreenY: event.clientY,
                    startViewportX: viewportRef.current.x, startViewportY: viewportRef.current.y,
                    selectStartCanvas: getCanvasPos(event.clientX, event.clientY),
                    selectRect: null,
                    selectionMode,
                };
                if (selectionMode === "replace") cb.onCanvasDeselect?.();
                cb.onCanvasMouseDown?.(event, dragRef.current.selectStartCanvas);
                event.currentTarget.setPointerCapture?.(event.pointerId);
                event.preventDefault();
            }
        }
    }, [getCanvasPos, renderTempEdge]);

    const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        const cb = callbacksRef.current;
        if (drag.type === "select" || drag.type === "pan") {
            const vp = viewportRef.current;
            if ((isSpacePressedRef.current || event.buttons === 4) && drag.type === "select") {
                drag.type = "pan";
                drag.startViewportX = vp.x;
                drag.startViewportY = vp.y;
                drag.startScreenX = event.clientX;
                drag.startScreenY = event.clientY;
            }
            if (drag.type === "pan") {
                if (drag.fromRightButton && Math.hypot(event.clientX - drag.startScreenX, event.clientY - drag.startScreenY) > 6) {
                    suppressContextMenuRef.current = true;
                }
                const next = {
                    x: drag.startViewportX + (event.clientX - drag.startScreenX),
                    y: drag.startViewportY + (event.clientY - drag.startScreenY),
                    k: vp.k,
                };
                const rect = containerRef.current?.getBoundingClientRect();
                const clamped = rect ? clampViewport(next, rect.width, rect.height) : next;
                if (!sameViewport(viewportRef.current, clamped)) applyViewportPresentation(clamped);
                return;
            }
            if (drag.type === "select") {
                const start = drag.selectStartCanvas;
                const current = getCanvasPos(event.clientX, event.clientY);
                drag.selectRect = {
                    x: Math.min(start.x, current.x), y: Math.min(start.y, current.y),
                    w: Math.abs(current.x - start.x), h: Math.abs(current.y - start.y),
                };
                renderSelectionBox(leaferRef.current, drag.selectRect, canvasThemes[useThemeStore.getState().theme]);
            }
        }

        // Connection drag
        const cp = connectingParamsRef.current;
        if (cp && !drag.type) {
            const fromNode = nodesRef.current.find((n) => n.id === cp.nodeId);
            if (fromNode) {
                const snapTarget = findConnectionSnapTarget(cp, event.clientX, event.clientY);
                const currentTarget = connectionTargetNodeIdRef.current;
                renderTempEdgeAtCanvasPoint(cp, snapTarget?.position ?? getCanvasPos(event.clientX, event.clientY));
                const nextTarget = snapTarget?.nodeId ?? null;
                if (nextTarget !== currentTarget) {
                    connectionTargetNodeIdRef.current = nextTarget;
                    cb.onConnectionTargetChange?.(nextTarget);
                }
            }
        }
    }, [applyViewportPresentation, findConnectionSnapTarget, getCanvasPos, containerRef, renderTempEdgeAtCanvasPoint]);

    const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        const cb = callbacksRef.current;

        if (drag.type === "pan") commitViewportChange();

        if (drag.type === "select" && drag.selectRect && drag.selectRect.w > 5 && drag.selectRect.h > 5) {
            clearSelectionBox(leaferRef.current);
            const r = drag.selectRect;
            const hitIds = nodesRef.current.filter((n) => {
                const nx2 = n.position.x + n.width;
                const ny2 = n.position.y + n.height;
                return n.position.x < r.x + r.w && nx2 > r.x && n.position.y < r.y + r.h && ny2 > r.y;
            }).map((n) => n.id);
            cb.onSelectionBox?.(hitIds, drag.selectionMode);
        } else if (drag.selectRect) {
            clearSelectionBox(leaferRef.current);
        }

        const cp = connectingParamsRef.current;
        const snapTarget = cp ? findConnectionSnapTarget(cp, event.clientX, event.clientY) : null;
        const targetId = snapTarget?.nodeId ?? connectionTargetNodeIdRef.current;
        if (cp && targetId && cp.nodeId !== targetId) {
            cb.onConnect?.(cp.nodeId, targetId);
        }

        if (cp && !targetId) {
            // 拖拽距离阈值：单击连接 handle（未拖动）不弹出创建节点菜单
            const start = connectStartScreenRef.current;
            const dragged = start ? Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5 : true;
            if (dragged) {
                const pos = getCanvasPos(event.clientX, event.clientY);
                frozenTempEdgeRef.current = { connection: cp, position: pos };
                renderTempEdgeAtCanvasPoint(cp, pos);
                cb.onConnectEnd?.(pos);
            } else {
                clearTempEdge();
                cb.onConnectEnd?.();
            }
        } else {
            clearTempEdge();
            cb.onConnectEnd?.();
        }
        connectingParamsRef.current = null;
        connectStartScreenRef.current = null;
        connectionStartCanvasPointRef.current = null;

        dragRef.current = {
            type: null, startScreenX: 0, startScreenY: 0,
            startViewportX: 0, startViewportY: 0,
            selectStartCanvas: { x: 0, y: 0 }, selectRect: null, selectionMode: 'replace',
        };
        document.body.style.userSelect = "";
    }, [clearTempEdge, commitViewportChange, findConnectionSnapTarget, getCanvasPos, renderTempEdgeAtCanvasPoint]);

    const handlePointerCancel = useCallback(() => {
        const drag = dragRef.current;
        if (drag.type === "pan") commitViewportChange();
        if (drag.type === "select") clearSelectionBox(leaferRef.current);
        dragRef.current = {
            type: null, startScreenX: 0, startScreenY: 0,
            startViewportX: 0, startViewportY: 0,
            selectStartCanvas: { x: 0, y: 0 }, selectRect: null, selectionMode: "replace",
        };
        if (!frozenTempEdgeRef.current) clearTempEdge();
        if (connectingParamsRef.current) callbacksRef.current.onConnectEnd?.();
        connectingParamsRef.current = null;
        connectionStartCanvasPointRef.current = null;
        connectionTargetNodeIdRef.current = null;
        callbacksRef.current.onConnectionTargetChange?.(null);
        document.body.style.userSelect = "";
    }, [clearTempEdge, commitViewportChange]);

    const handleContextMenu = useCallback((event: React.MouseEvent) => {
        event.preventDefault();
        if (suppressContextMenuRef.current) {
            suppressContextMenuRef.current = false;
            return;
        }
        const pos = getCanvasPos(event.clientX, event.clientY);
        callbacksRef.current.onContextMenu?.(event, pos);
    }, [getCanvasPos]);

    // 空白处双击打开创建菜单；节点双击由 Leafer DOUBLE_TAP 转发为节点 DOM 的 dblclick（用于文本编辑），这里过滤掉。
    const handleDoubleClick = useCallback((event: React.MouseEvent) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest?.("[data-node-id]")) return;
        if (Date.now() - lastNodeDoubleTapAtRef.current < 350) return;
        const pos = getCanvasPos(event.clientX, event.clientY);
        callbacksRef.current.onCanvasDoubleClick?.(event, pos);
    }, [getCanvasPos]);

    const viewportStyle: React.CSSProperties = useMemo(() => ({
        transform: viewportToCssTransform(viewport),
        transformOrigin: "0 0",
        position: "absolute",
        top: 0, left: 0,
        width: 1,
        height: 1,
        overflow: "visible",
        willChange: "transform",
        // 供节点远景标签做反向缩放（calc(1 / var(--canvas-k))），避免缩放时整树重渲染。
        ["--canvas-k" as string]: String(viewport.k),
    }) as React.CSSProperties, [viewport.x, viewport.y, viewport.k]);

    const cursor = isSpacePressed ? "grab" : "default";

    return (
        <div
            ref={containerRef}
            className="relative h-full w-full select-none overflow-hidden"
            style={{ backgroundColor: theme.canvas.background, cursor, touchAction: "none" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            onContextMenu={handleContextMenu}
            onDoubleClick={handleDoubleClick}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files.length && onDrop) {
                    const pos = getCanvasPos(e.clientX, e.clientY);
                    onDrop(e.dataTransfer.files, pos);
                }
            }}
        >
            <div data-leafer-editor-layer className="absolute inset-0">
                <div ref={leaferContainerRef} className="h-full w-full" />
            </div>
            <div ref={viewportElementRef} style={viewportStyle}>
                <CanvasScaleCtx.Provider value={scaleRef}>
                    {children}
                </CanvasScaleCtx.Provider>
            </div>
        </div>
    );
}

let _selectionRect: LUI.Rect | null = null;

function withAlpha(hex: string, alpha: number) {
    const value = hex.replace("#", "");
    const r = parseInt(value.slice(0, 2), 16);
    const g = parseInt(value.slice(2, 4), 16);
    const b = parseInt(value.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function buildBackgroundPattern(
    mode: CanvasBackgroundMode,
    gap: number,
    theme: (typeof canvasThemes)[keyof typeof canvasThemes],
) {
    const tile = document.createElement("canvas");
    tile.width = gap;
    tile.height = gap;
    const context = tile.getContext("2d");
    if (!context) return null;
    if (mode === "dots") {
        context.fillStyle = theme.canvas.dot;
        context.beginPath();
        context.arc(0, 0, 1.25, 0, Math.PI * 2);
        context.fill();
    } else {
        context.strokeStyle = theme.canvas.line;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(0.5, 0);
        context.lineTo(0.5, gap);
        context.moveTo(0, 0.5);
        context.lineTo(gap, 0.5);
        context.stroke();
    }
    return context.createPattern(tile, "repeat");
}

function renderSelectionBox(app: LUI.App | null, rect: { x: number; y: number; w: number; h: number } | null, theme: (typeof canvasThemes)[keyof typeof canvasThemes]) {
    if (!app) return;
    if (_selectionRect) { _selectionRect.remove(); _selectionRect = null; }
    if (!rect || rect.w < 2 || rect.h < 2) return;
    const box = new LUI.Rect({ x: rect.x, y: rect.y, width: rect.w, height: rect.h, fill: theme.canvas.selectionFill, stroke: theme.canvas.selectionStroke, strokeWidth: 1 });
    box.hittable = false;
    app.tree.add(box);
    _selectionRect = box;
}

function clearSelectionBox(app: LUI.App | null) {
    if (_selectionRect && app) { _selectionRect.remove(); _selectionRect = null; }
}

function editorBounds(node: CanvasNodeData) {
    const isMediaNode = node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Video;
    const isGroup = node.type === CanvasNodeType.Group;
    return {
        minWidth: node.type === CanvasNodeType.Image ? 120 : node.type === CanvasNodeType.Video ? 160 : isGroup ? 180 : 220,
        minHeight: node.type === CanvasNodeType.Image ? 96 : node.type === CanvasNodeType.Video ? 96 : isGroup ? 120 : 160,
        maxWidth: isGroup ? 4000 : isMediaNode ? 640 : node.type === CanvasNodeType.ComfyUI || node.type === CanvasNodeType.Config ? 720 : 520,
        maxHeight: isGroup ? 3000 : node.type === CanvasNodeType.Image ? 640 : node.type === CanvasNodeType.Video ? 480 : node.type === CanvasNodeType.ComfyUI || node.type === CanvasNodeType.Config ? 640 : 480,
        lockRatio: (node.type === CanvasNodeType.Image && !node.metadata?.freeResize) || node.type === CanvasNodeType.Video,
    };
}

function applyNodeInteractionVisual(
    rect: LUI.Rect,
    theme: (typeof canvasThemes)[keyof typeof canvasThemes],
    state: {
        selected: boolean;
        related: boolean;
        connectionTarget: boolean;
        hovered: boolean;
        dragging: boolean;
    },
) {
    const active = state.selected || state.connectionTarget;
    const isDark = theme.canvas.background === canvasThemes.dark.canvas.background;
    const ambientShadow = isDark ? "rgba(0,0,0,.42)" : "rgba(15,23,42,.18)";
    const accentShadow = withAlpha(theme.ui.accent, 0.28);
    rect.set({
        cornerRadius: CANVAS_NODE_RADIUS,
        stroke: active || state.related || state.hovered ? theme.ui.accent : theme.ui.hairline,
        strokeWidth: state.connectionTarget ? 2.4 : state.selected ? 1.8 : state.hovered ? 1.5 : state.related ? 1.25 : 1,
        shadow: state.dragging
            ? [
                { x: 0, y: 14, blur: 34, spread: 1, color: ambientShadow },
                { x: 0, y: 0, blur: 18, spread: 1, color: accentShadow },
            ]
            : state.connectionTarget
              ? [
                  { x: 0, y: 9, blur: 26, spread: 0, color: ambientShadow },
                  { x: 0, y: 0, blur: 18, spread: 1, color: accentShadow },
              ]
              : state.selected
                // 选中态只要细描边 + 轻微环境阴影，不要 accent 发光（对齐 TapNow 的低视觉重量选中框）。
                ? { x: 0, y: 6, blur: 16, spread: 0, color: ambientShadow }
                : state.hovered
                  ? { x: 0, y: 7, blur: 20, spread: 0, color: ambientShadow }
                  : undefined,
        cursor: state.dragging ? "grabbing" : "move",
    });
}

function getNodeLeaferFill(
    node: CanvasNodeData,
    theme: (typeof canvasThemes)[keyof typeof canvasThemes],
    mediaUrl?: string,
) {
    if (node.type === CanvasNodeType.Image && mediaUrl && node.metadata?.status !== "loading" && node.metadata?.status !== "error") {
        return {
            type: "image" as const,
            url: mediaUrl,
            mode: node.metadata?.freeResize ? "stretch" as const : "fit" as const,
        };
    }
    if (node.type === CanvasNodeType.Group) return theme.ui.controlFill;
    if (node.type === CanvasNodeType.Video) return "rgba(14,14,14,.72)";
    return theme.node.panel;
}

function getNodeLeaferText(node: CanvasNodeData) {
    if (node.metadata?.status === "loading" || node.metadata?.status === "error") return "";
    if (node.type === CanvasNodeType.Text) return node.metadata?.content?.trim() || "";
    // ComfyUI / Config / Audio 缩小时只显示节点标题，不显示提示词（提示词只存在于 Composer，避免遮挡画布）。
    if (node.type === CanvasNodeType.Audio || node.type === CanvasNodeType.Config || node.type === CanvasNodeType.ComfyUI) {
        return node.title.trim();
    }
    return "";
}

function markLeaferImageReady(container: HTMLDivElement | null, nodeId: string, ready: boolean | "error") {
    const element = container?.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(nodeId)}"]`);
    if (!element) return;
    if (ready === true) element.dataset.leaferImageReady = "true";
    else if (ready === "error") element.dataset.leaferImageReady = "error";
    else element.removeAttribute("data-leafer-image-ready");
}
