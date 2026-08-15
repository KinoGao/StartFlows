"use client";

import { memo, useMemo, useRef } from "react";

import { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData } from "../types";

type CanvasViewport = { x: number; y: number; k: number };

const MAP_WIDTH = 200;
const MAP_HEIGHT = 140;
const MAP_PADDING = 10;

type MiniMapLayout = {
    bounds: { left: number; top: number; right: number; bottom: number };
    scale: number;
    offsetX: number;
    offsetY: number;
};

/**
 * 节点点位层单独 memo：平移/缩放时父组件每帧只更新视口矩形，
 * 节点 span 列表仅在节点数据或选中集变化时才重渲染。
 */
const MiniMapNodeLayer = memo(function MiniMapNodeLayer({
    nodes,
    selectedNodeIds,
    layout,
    theme,
}: {
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    layout: MiniMapLayout;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
}) {
    return (
        <>
            {nodes.map((node) => {
                const point = {
                    x: layout.offsetX + (node.position.x - layout.bounds.left) * layout.scale,
                    y: layout.offsetY + (node.position.y - layout.bounds.top) * layout.scale,
                };
                const isGroup = node.type === CanvasNodeType.Group;
                const selected = selectedNodeIds.has(node.id);
                return (
                    <span
                        key={node.id}
                        className="absolute rounded-[2px]"
                        style={{
                            left: point.x,
                            top: point.y,
                            width: Math.max(2.5, node.width * layout.scale),
                            height: Math.max(2.5, node.height * layout.scale),
                            background: isGroup ? "transparent" : selected ? theme.ui.accent : theme.node.faint,
                            border: isGroup || selected ? `1px solid ${theme.ui.accent}` : "none",
                            opacity: isGroup ? 0.7 : selected ? 0.95 : 0.55,
                        }}
                    />
                );
            })}
        </>
    );
});

/**
 * 画布小地图（对齐 TapNow）：DOM 实现，按节点包围盒等比缩放，
 * 叠加当前视口矩形；点击/拖拽把视口中心导航到目标点。
 */
export function CanvasMiniMap({
    nodes,
    selectedNodeIds,
    viewport,
    containerSize,
    onNavigate,
}: {
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    viewport: CanvasViewport;
    containerSize: { width: number; height: number };
    onNavigate: (viewport: CanvasViewport) => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const mapRef = useRef<HTMLDivElement>(null);
    const navigatingRef = useRef(false);

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
        const worldWidth = Math.max(1, bounds.right - bounds.left);
        const worldHeight = Math.max(1, bounds.bottom - bounds.top);
        const scale = Math.min((MAP_WIDTH - MAP_PADDING * 2) / worldWidth, (MAP_HEIGHT - MAP_PADDING * 2) / worldHeight);
        // 内容在地图内居中
        const offsetX = (MAP_WIDTH - worldWidth * scale) / 2;
        const offsetY = (MAP_HEIGHT - worldHeight * scale) / 2;
        return { bounds, scale, offsetX, offsetY };
    }, [nodes]);

    const toMapPoint = (worldX: number, worldY: number) => {
        if (!layout) return { x: 0, y: 0 };
        return {
            x: layout.offsetX + (worldX - layout.bounds.left) * layout.scale,
            y: layout.offsetY + (worldY - layout.bounds.top) * layout.scale,
        };
    };

    const navigateFromPointer = (event: React.PointerEvent) => {
        const element = mapRef.current;
        if (!element || !layout || !containerSize.width || !containerSize.height) return;
        const rect = element.getBoundingClientRect();
        const worldX = layout.bounds.left + (event.clientX - rect.left - layout.offsetX) / layout.scale;
        const worldY = layout.bounds.top + (event.clientY - rect.top - layout.offsetY) / layout.scale;
        onNavigate({
            k: viewport.k,
            x: containerSize.width / 2 - worldX * viewport.k,
            y: containerSize.height / 2 - worldY * viewport.k,
        });
    };

    const viewportTopLeft = layout ? toMapPoint(-viewport.x / viewport.k, -viewport.y / viewport.k) : { x: 0, y: 0 };
    const viewportWidth = layout ? (containerSize.width / viewport.k) * layout.scale : 0;
    const viewportHeight = layout ? (containerSize.height / viewport.k) * layout.scale : 0;

    return (
        <div
            ref={mapRef}
            className="creative-os-panel absolute bottom-20 left-4 z-50 touch-none overflow-hidden rounded-xl border"
            style={{ width: MAP_WIDTH, height: MAP_HEIGHT, background: theme.ui.material, borderColor: theme.ui.hairline, boxShadow: theme.ui.shadow }}
            onPointerDown={(event) => {
                event.stopPropagation();
                navigatingRef.current = true;
                event.currentTarget.setPointerCapture(event.pointerId);
                navigateFromPointer(event);
            }}
            onPointerMove={(event) => {
                if (navigatingRef.current) navigateFromPointer(event);
            }}
            onPointerUp={(event) => {
                navigatingRef.current = false;
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={() => {
                navigatingRef.current = false;
            }}
        >
            {!layout ? (
                <div className="grid h-full place-items-center text-[11px]" style={{ color: theme.node.faint }}>
                    暂无节点
                </div>
            ) : (
                <>
                    <MiniMapNodeLayer nodes={nodes} selectedNodeIds={selectedNodeIds} layout={layout} theme={theme} />
                    <span
                        className="pointer-events-none absolute rounded-[3px]"
                        style={{
                            left: viewportTopLeft.x,
                            top: viewportTopLeft.y,
                            width: viewportWidth,
                            height: viewportHeight,
                            border: `1.5px solid ${theme.ui.accent}`,
                            background: theme.ui.accentSoft,
                        }}
                    />
                </>
            )}
        </div>
    );
}
