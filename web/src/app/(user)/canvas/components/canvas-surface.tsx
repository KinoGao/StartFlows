"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent as ReactDragEvent, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";

import { canvasThemes, type CanvasBackgroundMode, type CanvasTheme } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNode, type CanvasNodeProps } from "./canvas-node";
import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type Position, type ViewportTransform } from "../types";
import { edgePath, expandCanvasDragNodeIds, findConnectionTarget, isBlockedConnectionDrop, nodeAnchor, previewPath, samePosition, selectNodesInBounds, worldFromScreen } from "../utils/canvas-surface-geometry";

type CanvasPointerEvent = ReactMouseEvent | ReactPointerEvent;
type CanvasNodeUpdate = { id: string; position?: Position; width?: number; height?: number };
type CanvasNodeTransform = { position: Position; width: number; height: number };
export type CanvasInteractionMode = "pan" | "select";
type ConnectionDraft = { nodeId: string; handleType: "source" | "target"; world: Position; targetNodeId: string | null; pointerId: number | null };
type BoxSelection = { start: Position; current: Position; nodeIds: Set<string> };
type Interaction =
    | { kind: "pan"; pointerId: number; start: Position; viewport: ViewportTransform; moved: boolean }
    | { kind: "drag"; pointerId: number | null; start: Position; nodeIds: string[]; positions: Map<string, Position>; moved: boolean }
    | { kind: "box"; pointerId: number; start: Position; current: Position; initialNodeIds: Set<string>; moved: boolean };
type PinchState = { startDistance: number; startZoom: number; world: Position };
type WheelFrame = { clientX: number; clientY: number; deltaY: number };

type CanvasSurfaceProps = {
    containerRef?: RefObject<HTMLDivElement | null>;
    nodes: CanvasNodeData[];
    hiddenNodeIds?: ReadonlySet<string>;
    connections: CanvasConnection[];
    viewport: ViewportTransform;
    backgroundMode: CanvasBackgroundMode;
    interactionMode: CanvasInteractionMode;
    minimapOpen: boolean;
    selectedNodeIds: Set<string>;
    selectedConnectionId: string | null;
    relatedNodeIds: Set<string>;
    relatedConnectionIds: Set<string>;
    renderNode: (node: CanvasNodeData) => ReactNode;
    renderPanel?: (node: CanvasNodeData) => ReactNode;
    nodeProps: Omit<
        CanvasNodeProps,
        | "data"
        | "scale"
        | "isSelected"
        | "isRelated"
        | "isFocusRelated"
        | "isConnectionTarget"
        | "isConnecting"
        | "editRequestNonce"
        | "showPanel"
        | "showImageInfo"
        | "resourceLabel"
        | "mentionReferences"
        | "batchCount"
        | "batchExpanded"
        | "batchClosing"
        | "batchOpening"
        | "batchRecovering"
        | "batchMotion"
        | "renderPanel"
        | "renderNodeContent"
        | "onMouseDown"
        | "onConnectStart"
        | "onResize"
        | "onContextMenu"
    >;
    getNodeViewProps: (
        node: CanvasNodeData,
    ) => Pick<CanvasNodeProps, "editRequestNonce" | "showPanel" | "showImageInfo" | "resourceLabel" | "mentionReferences" | "batchCount" | "batchExpanded" | "batchClosing" | "batchOpening" | "batchRecovering" | "batchMotion">;
    onNodesCommit: (updates: CanvasNodeUpdate[]) => void;
    onSelectionChange: (nodeIds: Set<string>, connectionId: string | null) => void;
    onViewportCommit: (viewport: ViewportTransform) => void;
    onConnect: (connection: { source: string; target: string }) => void;
    onConnectionCreate: (connection: { nodeId: string; handleType: "source" | "target"; position: Position }) => void;
    onPaneClick: () => void;
    onPaneDoubleClick: (position: Position) => void;
    onPaneContextMenu: (event: MouseEvent | ReactMouseEvent) => void;
    onNodeContextMenu: (event: ReactMouseEvent, nodeId: string) => void;
    onEdgeContextMenu: (event: ReactMouseEvent, connectionId: string) => void;
    onDrop: (event: ReactDragEvent<Element>) => void;
    onDragStateChange?: (dragging: boolean) => void;
    overlay?: ReactNode;
};

function isInteractiveTarget(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest("button,input,textarea,select,video,audio,[data-canvas-no-drag],[data-canvas-no-zoom],[data-canvas-minimap],[data-connection-create-menu],[data-canvas-node-create-menu]"));
}

function isEditableKeyboardTarget(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest("button,input,textarea,select,[contenteditable='true'],[role='textbox']"));
}

function sameViewport(a: ViewportTransform, b: ViewportTransform) {
    return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.k - b.k) < 0.0001;
}

export function CanvasSurface({
    containerRef,
    nodes,
    hiddenNodeIds = EMPTY_NODE_IDS,
    connections,
    viewport,
    backgroundMode,
    interactionMode,
    minimapOpen,
    selectedNodeIds,
    selectedConnectionId,
    relatedNodeIds,
    relatedConnectionIds,
    renderNode,
    renderPanel,
    nodeProps,
    getNodeViewProps,
    onNodesCommit,
    onSelectionChange,
    onViewportCommit,
    onConnect,
    onConnectionCreate,
    onPaneClick,
    onPaneDoubleClick,
    onPaneContextMenu,
    onNodeContextMenu,
    onEdgeContextMenu,
    onDrop,
    onDragStateChange,
    overlay,
}: CanvasSurfaceProps) {
    const themeName = useThemeStore((state) => state.theme);
    const theme = canvasThemes[themeName];
    const surfaceRef = useRef<HTMLDivElement>(null);
    const nodesRef = useRef(nodes);
    const selectedNodeIdsRef = useRef(selectedNodeIds);
    const selectedConnectionIdRef = useRef(selectedConnectionId);
    const interactionRef = useRef<Interaction | null>(null);
    const connectionRef = useRef<ConnectionDraft | null>(null);
    const touchPointersRef = useRef(new Map<number, Position>());
    const pinchRef = useRef<PinchState | null>(null);
    const localTransformsRef = useRef<Record<string, CanvasNodeTransform>>({});
    const resizingNodeIdRef = useRef<string | null>(null);
    const displayViewportRef = useRef(viewport);
    const viewportDirtyRef = useRef(false);
    const previousViewportPropRef = useRef(viewport);
    const animationFrameRef = useRef<number | null>(null);
    const frameActionsRef = useRef(new Map<string, () => void>());
    const wheelFrameRef = useRef<WheelFrame | null>(null);
    const wheelCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const boxSelectionRef = useRef<BoxSelection | null>(null);
    const temporaryPanRef = useRef(false);
    const [localTransforms, setLocalTransforms] = useState<Record<string, CanvasNodeTransform>>({});
    const [displayViewport, setDisplayViewport] = useState(viewport);
    const [connection, setConnection] = useState<ConnectionDraft | null>(null);
    const [boxSelection, setBoxSelection] = useState<BoxSelection | null>(null);
    const [temporaryPan, setTemporaryPan] = useState(false);
    const [surfaceSize, setSurfaceSize] = useState({ width: 1280, height: 760 });
    const setSurfaceRef = useCallback(
        (element: HTMLDivElement | null) => {
            surfaceRef.current = element;
            if (containerRef) containerRef.current = element;
        },
        [containerRef],
    );

    nodesRef.current = nodes;
    selectedNodeIdsRef.current = selectedNodeIds;
    selectedConnectionIdRef.current = selectedConnectionId;

    const displayNodes = useMemo(
        () =>
            nodes.map((node) => {
                const transform = localTransforms[node.id];
                return transform ? { ...node, ...transform } : node;
            }),
        [localTransforms, nodes],
    );
    const displayNodesRef = useRef(displayNodes);
    displayNodesRef.current = displayNodes;
    const nodesById = useMemo(() => new Map(displayNodes.map((node) => [node.id, node])), [displayNodes]);
    const visibleDisplayNodes = useMemo(() => displayNodes.filter((node) => !hiddenNodeIds.has(node.id)), [displayNodes, hiddenNodeIds]);
    const visibleDisplayNodesRef = useRef(visibleDisplayNodes);
    visibleDisplayNodesRef.current = visibleDisplayNodes;
    const viewBounds = useMemo(() => {
        const padding = 280 / displayViewport.k;
        return {
            left: -displayViewport.x / displayViewport.k - padding,
            top: -displayViewport.y / displayViewport.k - padding,
            right: (surfaceSize.width - displayViewport.x) / displayViewport.k + padding,
            bottom: (surfaceSize.height - displayViewport.y) / displayViewport.k + padding,
        };
    }, [displayViewport, surfaceSize.height, surfaceSize.width]);
    const renderedNodes = useMemo(
        () => visibleDisplayNodes.filter((node) => node.position.x < viewBounds.right && node.position.x + node.width > viewBounds.left && node.position.y < viewBounds.bottom && node.position.y + node.height > viewBounds.top),
        [viewBounds, visibleDisplayNodes],
    );
    const flowConnections = useMemo(
        () =>
            connections.filter((item) => {
                const from = nodesById.get(item.fromNodeId);
                const to = nodesById.get(item.toNodeId);
                if (!from || !to || hiddenNodeIds.has(from.id) || hiddenNodeIds.has(to.id)) return false;
                const start = nodeAnchor(from, "source");
                const end = nodeAnchor(to, "target");
                return Math.min(start.x, end.x) < viewBounds.right && Math.max(start.x, end.x) > viewBounds.left && Math.min(start.y, end.y) < viewBounds.bottom && Math.max(start.y, end.y) > viewBounds.top;
            }),
        [connections, hiddenNodeIds, nodesById, viewBounds],
    );

    useEffect(() => {
        if (interactionRef.current?.kind === "drag" || resizingNodeIdRef.current) return;
        if (!Object.keys(localTransformsRef.current).length) return;
        localTransformsRef.current = {};
        setLocalTransforms({});
    }, [nodes]);

    useEffect(() => {
        const propChanged = !sameViewport(previousViewportPropRef.current, viewport);
        previousViewportPropRef.current = viewport;
        if (!propChanged || sameViewport(displayViewportRef.current, viewport)) return;
        if (wheelCommitTimerRef.current) clearTimeout(wheelCommitTimerRef.current);
        wheelCommitTimerRef.current = null;
        viewportDirtyRef.current = false;
        displayViewportRef.current = viewport;
        setDisplayViewport(viewport);
    }, [viewport]);

    const flushFrame = useCallback(() => {
        if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
        const actions = [...frameActionsRef.current.values()];
        frameActionsRef.current.clear();
        actions.forEach((action) => action());
    }, []);

    const scheduleFrame = useCallback((key: string, action: () => void) => {
        frameActionsRef.current.set(key, action);
        if (animationFrameRef.current !== null) return;
        animationFrameRef.current = requestAnimationFrame(() => {
            animationFrameRef.current = null;
            const actions = [...frameActionsRef.current.values()];
            frameActionsRef.current.clear();
            actions.forEach((next) => next());
        });
    }, []);

    const previewViewport = useCallback((next: ViewportTransform) => {
        viewportDirtyRef.current = true;
        displayViewportRef.current = next;
        setDisplayViewport(next);
    }, []);

    const commitViewport = useCallback(() => {
        if (wheelCommitTimerRef.current) clearTimeout(wheelCommitTimerRef.current);
        wheelCommitTimerRef.current = null;
        if (!viewportDirtyRef.current) return;
        viewportDirtyRef.current = false;
        onViewportCommit(displayViewportRef.current);
    }, [onViewportCommit]);

    useEffect(
        () => () => {
            if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
            if (wheelCommitTimerRef.current) clearTimeout(wheelCommitTimerRef.current);
        },
        [],
    );

    useEffect(() => {
        const element = surfaceRef.current;
        if (!element) return;
        const resize = () => setSurfaceSize((current) => (current.width === element.clientWidth && current.height === element.clientHeight ? current : { width: element.clientWidth, height: element.clientHeight }));
        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(element);
        return () => observer.disconnect();
    }, []);

    const screenToWorld = useCallback((clientX: number, clientY: number) => {
        const rect = surfaceRef.current?.getBoundingClientRect();
        return rect ? worldFromScreen(clientX, clientY, displayViewportRef.current, rect) : { x: 0, y: 0 };
    }, []);

    const setSelection = useCallback(
        (nodeIds: Set<string>, connectionId: string | null = null) => {
            onSelectionChange(nodeIds, connectionId);
        },
        [onSelectionChange],
    );

    const endConnection = useCallback(
        (clientX: number, clientY: number) => {
            const draft = connectionRef.current;
            if (!draft) return;
            const world = screenToWorld(clientX, clientY);
            const targetId = draft.targetNodeId || findConnectionTarget(world, draft, visibleDisplayNodesRef.current, displayViewportRef.current.k);
            if (targetId) {
                onConnect(draft.handleType === "source" ? { source: draft.nodeId, target: targetId } : { source: targetId, target: draft.nodeId });
            } else if (!isBlockedConnectionDrop(world, draft, visibleDisplayNodesRef.current, displayViewportRef.current.k)) {
                onConnectionCreate({ nodeId: draft.nodeId, handleType: draft.handleType, position: world });
            }
            connectionRef.current = null;
            setConnection(null);
        },
        [onConnect, onConnectionCreate, screenToWorld],
    );

    const handleConnectStart = useCallback(
        (event: CanvasPointerEvent, nodeId: string, handleType: "source" | "target") => {
            event.preventDefault();
            event.stopPropagation();
            const pointerId = "pointerId" in event ? event.pointerId : null;
            const next = { nodeId, handleType, world: screenToWorld(event.clientX, event.clientY), targetNodeId: null, pointerId } satisfies ConnectionDraft;
            connectionRef.current = next;
            setConnection(next);
        },
        [screenToWorld],
    );

    const commitDrag = useCallback(() => {
        const interaction = interactionRef.current;
        if (!interaction || interaction.kind !== "drag") return;
        const updates: CanvasNodeUpdate[] = [];
        interaction.nodeIds.forEach((id) => {
            const original = interaction.positions.get(id);
            const current = localTransformsRef.current[id]?.position;
            if (original && current && !samePosition(original, current)) updates.push({ id, position: current });
        });
        if (updates.length) onNodesCommit(updates);
        interactionRef.current = null;
        onDragStateChange?.(false);
    }, [onDragStateChange, onNodesCommit]);

    const cancelTransientInteraction = useCallback(() => {
        flushFrame();
        connectionRef.current = null;
        setConnection(null);
        boxSelectionRef.current = null;
        setBoxSelection(null);
        pinchRef.current = null;
        touchPointersRef.current.clear();
        wheelFrameRef.current = null;
        const interaction = interactionRef.current;
        interactionRef.current = null;
        if (interaction?.kind === "drag") {
            localTransformsRef.current = {};
            setLocalTransforms({});
            onDragStateChange?.(false);
        }
        commitViewport();
    }, [commitViewport, flushFrame, onDragStateChange]);

    const handleNodeMouseDown = useCallback(
        (event: CanvasPointerEvent, nodeId: string) => {
            if (isInteractiveTarget(event.target)) return;
            if (displayNodesRef.current.find((node) => node.id === nodeId)?.type !== CanvasNodeType.Text) event.preventDefault();
            const additive = event.shiftKey || event.ctrlKey || event.metaKey;
            const nextSelection = new Set(selectedNodeIdsRef.current);
            if (additive) {
                if (nextSelection.has(nodeId)) nextSelection.delete(nodeId);
                else nextSelection.add(nodeId);
            } else if (!nextSelection.has(nodeId)) {
                nextSelection.clear();
                nextSelection.add(nodeId);
            }
            setSelection(nextSelection, null);
            const dragIds = nextSelection.has(nodeId) ? expandCanvasDragNodeIds(displayNodesRef.current, nextSelection) : [];
            if (!dragIds.length) return;
            const positions = new Map(dragIds.map((id) => [id, displayNodesRef.current.find((node) => node.id === id)?.position || { x: 0, y: 0 }]));
            interactionRef.current = { kind: "drag", pointerId: "pointerId" in event ? event.pointerId : null, start: { x: event.clientX, y: event.clientY }, nodeIds: dragIds, positions, moved: false };
            onDragStateChange?.(true);
        },
        [onDragStateChange, setSelection],
    );

    const handlePointerDown = useCallback(
        (event: ReactPointerEvent<HTMLDivElement>) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest("[data-node-id],[data-connection-id],[data-canvas-minimap],[data-connection-create-menu],[data-canvas-node-create-menu]")) return;
            if (event.pointerType === "touch") {
                event.currentTarget.setPointerCapture?.(event.pointerId);
                touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                const points = [...touchPointersRef.current.values()];
                if (points.length >= 2) {
                    const [first, second] = points;
                    const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
                    pinchRef.current = { startDistance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)), startZoom: displayViewportRef.current.k, world: screenToWorld(midpoint.x, midpoint.y) };
                    interactionRef.current = null;
                } else {
                    interactionRef.current = { kind: "pan", pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, viewport: displayViewportRef.current, moved: false };
                }
                return;
            }
            if (event.button === 1 || event.button === 0) {
                const world = screenToWorld(event.clientX, event.clientY);
                const additive = event.shiftKey || event.ctrlKey || event.metaKey;
                const kind = event.button === 1 || (interactionMode === "pan" && !additive) ? "pan" : "box";
                const initialNodeIds = kind === "box" && additive ? new Set(selectedNodeIdsRef.current) : new Set<string>();
                interactionRef.current =
                    kind === "box"
                        ? { kind, pointerId: event.pointerId, start: world, current: world, initialNodeIds, moved: false }
                        : { kind, pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, viewport: displayViewportRef.current, moved: false };
                if (kind === "box") {
                    const next = { start: world, current: world, nodeIds: initialNodeIds };
                    boxSelectionRef.current = next;
                    setBoxSelection(next);
                }
                event.currentTarget.setPointerCapture?.(event.pointerId);
            }
        },
        [interactionMode, screenToWorld],
    );

    const handlePointerDownCapture = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
        if (event.button === 0 && !isInteractiveTarget(event.target)) event.currentTarget.focus({ preventScroll: true });
        if (!temporaryPanRef.current || event.button !== 0 || event.pointerType === "touch") return;
        event.preventDefault();
        event.stopPropagation();
        interactionRef.current = { kind: "pan", pointerId: event.pointerId, start: { x: event.clientX, y: event.clientY }, viewport: displayViewportRef.current, moved: false };
        event.currentTarget.setPointerCapture?.(event.pointerId);
    }, []);

    useEffect(() => {
        const handlePointerMove = (event: PointerEvent) => {
            if (event.pointerType === "touch" && touchPointersRef.current.has(event.pointerId)) {
                touchPointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
                const points = [...touchPointersRef.current.values()];
                if (points.length >= 2 && pinchRef.current) {
                    const [first, second] = points;
                    const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
                    const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
                    const pinch = pinchRef.current;
                    const rect = surfaceRef.current?.getBoundingClientRect();
                    if (rect) {
                        scheduleFrame("pinch", () => {
                            if (pinchRef.current !== pinch) return;
                            const zoom = Math.min(5, Math.max(0.05, pinch.startZoom * (distance / pinch.startDistance)));
                            previewViewport({ x: midpoint.x - rect.left - pinch.world.x * zoom, y: midpoint.y - rect.top - pinch.world.y * zoom, k: zoom });
                        });
                    }
                    return;
                }
            }
            const draft = connectionRef.current;
            if (draft && (draft.pointerId === null || draft.pointerId === event.pointerId)) {
                const clientX = event.clientX;
                const clientY = event.clientY;
                scheduleFrame("connection", () => {
                    if (connectionRef.current !== draft) return;
                    const world = screenToWorld(clientX, clientY);
                    const next = { ...draft, world, targetNodeId: findConnectionTarget(world, draft, visibleDisplayNodesRef.current, displayViewportRef.current.k) };
                    connectionRef.current = next;
                    setConnection(next);
                });
                return;
            }
            const interaction = interactionRef.current;
            if (!interaction || (interaction.pointerId !== null && interaction.pointerId !== event.pointerId)) return;
            if (interaction.kind === "drag") {
                const clientX = event.clientX;
                const clientY = event.clientY;
                scheduleFrame("drag", () => {
                    if (interactionRef.current !== interaction) return;
                    const dx = (clientX - interaction.start.x) / displayViewportRef.current.k;
                    const dy = (clientY - interaction.start.y) / displayViewportRef.current.k;
                    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) interaction.moved = true;
                    const next = { ...localTransformsRef.current };
                    interaction.nodeIds.forEach((id) => {
                        const start = interaction.positions.get(id);
                        const current = next[id] || displayNodesRef.current.find((node) => node.id === id);
                        if (start && current) next[id] = { position: { x: start.x + dx, y: start.y + dy }, width: current.width, height: current.height };
                    });
                    localTransformsRef.current = next;
                    setLocalTransforms(next);
                });
                return;
            }
            if (interaction.kind === "pan") {
                const clientX = event.clientX;
                const clientY = event.clientY;
                scheduleFrame("pan", () => {
                    if (interactionRef.current !== interaction) return;
                    const dx = clientX - interaction.start.x;
                    const dy = clientY - interaction.start.y;
                    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) interaction.moved = true;
                    previewViewport({ x: interaction.viewport.x + dx, y: interaction.viewport.y + dy, k: interaction.viewport.k });
                });
                return;
            }
            const clientX = event.clientX;
            const clientY = event.clientY;
            scheduleFrame("box", () => {
                if (interactionRef.current !== interaction) return;
                const current = screenToWorld(clientX, clientY);
                interaction.current = current;
                if (Math.abs(current.x - interaction.start.x) > 2 || Math.abs(current.y - interaction.start.y) > 2) interaction.moved = true;
                const next = {
                    start: interaction.start,
                    current,
                    nodeIds: selectNodesInBounds(visibleDisplayNodesRef.current, interaction.start, current, interaction.initialNodeIds),
                };
                boxSelectionRef.current = next;
                setBoxSelection(next);
            });
        };
        const handlePointerUp = (event: PointerEvent) => {
            flushFrame();
            let finishedPinch = false;
            if (event.pointerType === "touch") {
                touchPointersRef.current.delete(event.pointerId);
                if (touchPointersRef.current.size < 2 && pinchRef.current) {
                    pinchRef.current = null;
                    finishedPinch = true;
                }
            }
            if (connectionRef.current && (connectionRef.current.pointerId === null || connectionRef.current.pointerId === event.pointerId)) {
                endConnection(event.clientX, event.clientY);
                return;
            }
            if (finishedPinch) {
                commitViewport();
                return;
            }
            const interaction = interactionRef.current;
            if (!interaction || (interaction.pointerId !== null && interaction.pointerId !== event.pointerId)) return;
            if (interaction.kind === "drag") commitDrag();
            else if (interaction.kind === "box") {
                interactionRef.current = null;
                setSelection(boxSelectionRef.current?.nodeIds || new Set(), null);
                boxSelectionRef.current = null;
                setBoxSelection(null);
            } else {
                if (!interaction.moved) onPaneClick();
                else commitViewport();
                interactionRef.current = null;
            }
        };
        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", handlePointerUp);
        window.addEventListener("pointercancel", cancelTransientInteraction);
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("pointercancel", cancelTransientInteraction);
        };
    }, [cancelTransientInteraction, commitDrag, commitViewport, endConnection, flushFrame, onPaneClick, previewViewport, scheduleFrame, screenToWorld, setSelection]);

    const handleWheel = useCallback(
        (event: React.WheelEvent<HTMLDivElement>) => {
            if (isInteractiveTarget(event.target)) return;
            event.preventDefault();
            const pending = wheelFrameRef.current;
            wheelFrameRef.current = {
                clientX: event.clientX,
                clientY: event.clientY,
                deltaY: (pending?.deltaY || 0) + event.deltaY,
            };
            scheduleFrame("wheel", () => {
                const input = wheelFrameRef.current;
                wheelFrameRef.current = null;
                const rect = surfaceRef.current?.getBoundingClientRect();
                if (!input || !rect) return;
                const current = displayViewportRef.current;
                const factor = Math.pow(1.1, -input.deltaY / 100);
                const nextZoom = Math.min(5, Math.max(0.05, current.k * factor));
                const localX = input.clientX - rect.left;
                const localY = input.clientY - rect.top;
                const world = { x: (localX - current.x) / current.k, y: (localY - current.y) / current.k };
                previewViewport({ x: localX - world.x * nextZoom, y: localY - world.y * nextZoom, k: nextZoom });
            });
            if (wheelCommitTimerRef.current) clearTimeout(wheelCommitTimerRef.current);
            wheelCommitTimerRef.current = setTimeout(() => {
                flushFrame();
                commitViewport();
            }, 140);
        },
        [commitViewport, flushFrame, previewViewport, scheduleFrame],
    );

    const handlePaneDoubleClick = useCallback(
        (event: ReactMouseEvent<HTMLDivElement>) => {
            const target = event.target instanceof Element ? event.target : null;
            if (target?.closest("[data-node-id],[data-connection-id],[data-connection-create-menu],[data-canvas-node-create-menu]")) return;
            onPaneDoubleClick(screenToWorld(event.clientX, event.clientY));
        },
        [onPaneDoubleClick, screenToWorld],
    );

    const previewNodeResize = useCallback(
        (id: string, width: number, height: number, position?: Position) => {
            scheduleFrame(`resize:${id}`, () => {
                const current = localTransformsRef.current[id] || nodesRef.current.find((node) => node.id === id);
                if (!current) return;
                const next = { ...localTransformsRef.current, [id]: { position: position || current.position, width, height } };
                resizingNodeIdRef.current = id;
                localTransformsRef.current = next;
                setLocalTransforms(next);
            });
        },
        [scheduleFrame],
    );

    const commitNodeResize = useCallback(
        (id: string, width: number, height: number, position?: Position) => {
            flushFrame();
            resizingNodeIdRef.current = null;
            onNodesCommit([{ id, width, height, position }]);
        },
        [flushFrame, onNodesCommit],
    );

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") cancelTransientInteraction();
            if (event.code !== "Space" || isEditableKeyboardTarget(event.target)) return;
            event.preventDefault();
            if (temporaryPanRef.current) return;
            temporaryPanRef.current = true;
            setTemporaryPan(true);
        };
        const handleKeyUp = (event: KeyboardEvent) => {
            if (event.code !== "Space") return;
            temporaryPanRef.current = false;
            setTemporaryPan(false);
        };
        const handleBlur = () => {
            temporaryPanRef.current = false;
            setTemporaryPan(false);
            cancelTransientInteraction();
        };
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("keyup", handleKeyUp);
        window.addEventListener("blur", handleBlur);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("keyup", handleKeyUp);
            window.removeEventListener("blur", handleBlur);
        };
    }, [cancelTransientInteraction]);

    const activeSelectedNodeIds = boxSelection?.nodeIds || selectedNodeIds;
    const connectionStartNode = connection ? nodesById.get(connection.nodeId) : null;
    const previewMinimapViewport = useCallback((next: ViewportTransform) => scheduleFrame("minimap", () => previewViewport(next)), [previewViewport, scheduleFrame]);
    const commitMinimapViewport = useCallback(() => {
        flushFrame();
        commitViewport();
    }, [commitViewport, flushFrame]);
    const worldStyle: CSSProperties = { transform: `translate(${displayViewport.x}px, ${displayViewport.y}px) scale(${displayViewport.k})`, transformOrigin: "0 0" };
    const canvasStyle: CSSProperties = { background: theme.canvas.backdrop, color: theme.node.text, touchAction: "none", cursor: temporaryPan || interactionMode === "pan" ? "grab" : "default" };
    const gridSize = Math.max(4, (backgroundMode === "dots" ? 22 : 32) * displayViewport.k);
    const selectionStyle = boxSelection
        ? {
              left: Math.min(boxSelection.start.x, boxSelection.current.x),
              top: Math.min(boxSelection.start.y, boxSelection.current.y),
              width: Math.abs(boxSelection.current.x - boxSelection.start.x),
              height: Math.abs(boxSelection.current.y - boxSelection.start.y),
          }
        : undefined;

    return (
        <div
            ref={setSurfaceRef}
            data-canvas-surface
            data-canvas-interaction-mode={interactionMode}
            data-canvas-temporary-pan={temporaryPan ? "true" : "false"}
            tabIndex={-1}
            className="canvas-surface absolute inset-0 select-none overflow-hidden"
            style={canvasStyle}
            onPointerDownCapture={handlePointerDownCapture}
            onPointerDown={handlePointerDown}
            onDoubleClick={handlePaneDoubleClick}
            onWheel={handleWheel}
            onDrop={onDrop}
            onDragOver={(event) => event.preventDefault()}
            onContextMenu={(event) => onPaneContextMenu(event)}
        >
            {backgroundMode !== "blank" ? (
                <div
                    className="pointer-events-none absolute inset-0 opacity-70"
                    style={{
                        backgroundImage:
                            backgroundMode === "dots" ? `radial-gradient(circle, ${theme.canvas.dot} 1px, transparent 1px)` : `linear-gradient(${theme.canvas.line} 1px, transparent 1px), linear-gradient(90deg, ${theme.canvas.line} 1px, transparent 1px)`,
                        backgroundSize: `${gridSize}px ${gridSize}px`,
                        backgroundPosition: `${displayViewport.x}px ${displayViewport.y}px`,
                    }}
                />
            ) : null}
            <div className="pointer-events-none absolute inset-0 overflow-visible" style={worldStyle}>
                <svg className="absolute left-0 top-0 h-full w-full overflow-visible" style={{ pointerEvents: "none" }} aria-hidden="true">
                    {flowConnections.map((item) => {
                        const from = nodesById.get(item.fromNodeId);
                        const to = nodesById.get(item.toNodeId);
                        if (!from || !to) return null;
                        const active = selectedConnectionId === item.id || relatedConnectionIds.has(item.id);
                        const path = edgePath(from, to);
                        return (
                            <g key={item.id} data-connection-id={item.id}>
                                <path
                                    d={path}
                                    fill="none"
                                    stroke="transparent"
                                    strokeWidth={18}
                                    style={{ pointerEvents: "stroke", cursor: "pointer" }}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setSelection(new Set(), item.id);
                                    }}
                                    onContextMenu={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        onEdgeContextMenu(event, item.id);
                                    }}
                                />
                                <path d={path} fill="none" stroke={active ? theme.node.activeStroke : theme.node.muted} strokeWidth={active ? 3 : 2} strokeOpacity={active ? 1 : 0.8} strokeLinecap="round" style={{ pointerEvents: "none" }} />
                            </g>
                        );
                    })}
                    {connection && connectionStartNode ? (
                        <path
                            d={previewPath(
                                nodeAnchor(connectionStartNode, connection.handleType),
                                connection.targetNodeId && nodesById.get(connection.targetNodeId) ? nodeAnchor(nodesById.get(connection.targetNodeId)!, connection.handleType === "source" ? "target" : "source") : connection.world,
                                connection.handleType,
                            )}
                            fill="none"
                            stroke={theme.node.activeStroke}
                            strokeWidth={2.5}
                            strokeDasharray="6 5"
                            strokeLinecap="round"
                            style={{ pointerEvents: "none" }}
                        />
                    ) : null}
                </svg>
                <div className="pointer-events-auto absolute inset-0 overflow-visible">
                    {renderedNodes.map((node) => {
                        const viewProps = getNodeViewProps(node);
                        return (
                            <CanvasNode
                                key={node.id}
                                {...nodeProps}
                                {...viewProps}
                                data={node}
                                scale={displayViewport.k}
                                isSelected={activeSelectedNodeIds.has(node.id)}
                                isRelated={relatedNodeIds.has(node.id)}
                                isFocusRelated={activeSelectedNodeIds.has(node.id) || relatedNodeIds.has(node.id)}
                                isConnectionTarget={connection?.targetNodeId === node.id}
                                isConnecting={connection?.nodeId === node.id}
                                renderPanel={renderPanel}
                                renderNodeContent={renderNode}
                                onMouseDown={handleNodeMouseDown}
                                onConnectStart={handleConnectStart}
                                onResize={previewNodeResize}
                                onResizeEnd={commitNodeResize}
                                onContextMenu={(event, id) => onNodeContextMenu(event, id)}
                            />
                        );
                    })}
                    {selectionStyle ? <div className="pointer-events-none absolute border" style={{ ...selectionStyle, borderColor: theme.canvas.selectionStroke, background: theme.canvas.selectionFill }} /> : null}
                    {overlay}
                </div>
            </div>
            {minimapOpen ? <CanvasMiniMap nodes={visibleDisplayNodes} viewport={displayViewport} viewportSize={surfaceSize} theme={theme} onViewportPreview={previewMinimapViewport} onViewportCommit={commitMinimapViewport} /> : null}
        </div>
    );
}

const EMPTY_NODE_IDS = new Set<string>();

function CanvasMiniMap({
    nodes,
    viewport,
    viewportSize,
    theme,
    onViewportPreview,
    onViewportCommit,
}: {
    nodes: CanvasNodeData[];
    viewport: ViewportTransform;
    viewportSize: { width: number; height: number };
    theme: CanvasTheme;
    onViewportPreview: (viewport: ViewportTransform) => void;
    onViewportCommit: () => void;
}) {
    const width = Math.min(220, Math.max(140, viewportSize.width - 32));
    const height = Math.round(width * (2 / 3));
    const ref = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState(false);
    const bounds = useMemo(() => {
        if (!nodes.length) return { x: -500, y: -400, width: 1000, height: 800 };
        const minX = Math.min(...nodes.map((node) => node.position.x)) - 320;
        const minY = Math.min(...nodes.map((node) => node.position.y)) - 240;
        const maxX = Math.max(...nodes.map((node) => node.position.x + node.width)) + 320;
        const maxY = Math.max(...nodes.map((node) => node.position.y + node.height)) + 240;
        return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
    }, [nodes]);
    const scale = Math.min(width / bounds.width, height / bounds.height);
    const offsetX = (width - bounds.width * scale) / 2;
    const offsetY = (height - bounds.height * scale) / 2;
    const point = (x: number, y: number) => ({ x: offsetX + (x - bounds.x) * scale, y: offsetY + (y - bounds.y) * scale });
    const viewportWorld = { x: -viewport.x / viewport.k, y: -viewport.y / viewport.k, width: viewportSize.width / viewport.k, height: viewportSize.height / viewport.k };
    const viewPoint = point(viewportWorld.x, viewportWorld.y);
    const update = (event: ReactPointerEvent<HTMLDivElement>) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        const world = { x: (event.clientX - rect.left - offsetX) / scale + bounds.x, y: (event.clientY - rect.top - offsetY) / scale + bounds.y };
        onViewportPreview({ x: viewportSize.width / 2 - world.x * viewport.k, y: viewportSize.height / 2 - world.y * viewport.k, k: viewport.k });
    };
    const finishDrag = () => {
        if (!dragging) return;
        setDragging(false);
        onViewportCommit();
    };
    return (
        <div
            data-canvas-minimap
            data-canvas-no-zoom
            className="absolute bottom-20 left-3 z-50 overflow-hidden rounded-lg border shadow-sm sm:bottom-24 sm:left-5"
            style={{ width, height, background: theme.toolbar.panel, borderColor: theme.toolbar.border }}
        >
            <div
                ref={ref}
                className="relative h-full w-full cursor-crosshair"
                onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDragging(true);
                    update(event);
                }}
                onPointerMove={(event) => {
                    if (dragging) update(event);
                }}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
            >
                {nodes.map((node) => {
                    const p = point(node.position.x, node.position.y);
                    return (
                        <div
                            key={node.id}
                            className="absolute rounded-sm"
                            style={{ left: p.x, top: p.y, width: Math.max(2, node.width * scale), height: Math.max(2, node.height * scale), background: node.type === CanvasNodeType.Config ? theme.node.activeStroke : theme.node.muted, opacity: 0.72 }}
                        />
                    );
                })}
                <div
                    className="pointer-events-none absolute border"
                    style={{ left: viewPoint.x, top: viewPoint.y, width: Math.max(4, viewportWorld.width * scale), height: Math.max(4, viewportWorld.height * scale), borderColor: theme.node.activeStroke, background: theme.canvas.selectionFill }}
                />
            </div>
        </div>
    );
}
