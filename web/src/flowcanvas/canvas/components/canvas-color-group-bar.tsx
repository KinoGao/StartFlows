"use client";

import { useMemo, useState } from "react";
import { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";
import type { CanvasNodeData } from "../types";
import { getPinColor, getPinColorValue, type PinColorId } from "../utils/canvas-pin-utils";

export type PinColorGroup = {
    color: PinColorId;
    nodes: CanvasNodeData[];
};

/** 读取节点 Pin 颜色（canvas-pin-utils 色板内合法 id；缺失或非法返回 undefined）。 */
export function readNodePinColor(node: CanvasNodeData): PinColorId | undefined {
    return getPinColor(node);
}

/** 按 Pin 颜色汇总节点，按数量降序。无 Pin 颜色的节点不参与。 */
export function groupNodesByPinColor(nodes: CanvasNodeData[]): PinColorGroup[] {
    const map = new Map<PinColorId, PinColorGroup>();
    for (const node of nodes) {
        const color = getPinColor(node);
        if (!color) continue;
        const group = map.get(color) ?? { color, nodes: [] };
        group.nodes.push(node);
        map.set(color, group);
    }
    return Array.from(map.values()).sort((a, b) => b.nodes.length - a.nodes.length);
}

export function CanvasColorGroupBar({ nodes, onLocateNode }: { nodes: CanvasNodeData[]; onLocateNode: (nodeId: string) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [expandedColor, setExpandedColor] = useState<string | null>(null);

    const groups = useMemo(() => groupNodesByPinColor(nodes), [nodes]);
    if (groups.length === 0) return null;

    return (
        <div className="pointer-events-none absolute left-1/2 top-[68px] z-[60] -translate-x-1/2">
            {/* 极简扁平风格（AGENTS.md §8）：无边框、无阴影、无胶囊背景，仅保留轻微 hover */}
            <div className="pointer-events-auto flex items-center gap-1" style={{ color: theme.node.muted }}>
                {groups.map((group) => {
                    const expanded = expandedColor === group.color;
                    return (
                        <div key={group.color} className="relative">
                            <button
                                type="button"
                                className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors"
                                style={{ color: expanded ? theme.node.text : theme.node.muted }}
                                title={`${group.nodes.length} 个节点`}
                                onMouseEnter={(event) => (event.currentTarget.style.background = theme.toolbar.itemHover)}
                                onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
                                onClick={() => setExpandedColor(expanded ? null : group.color)}
                            >
                                <span className="size-2.5 rounded-full" style={{ background: getPinColorValue(group.color) ?? group.color }} />
                                <span>{group.nodes.length}</span>
                            </button>
                            {expanded ? (
                                <div
                                    className="creative-os-panel absolute left-0 top-9 z-[61] max-h-64 w-52 overflow-y-auto rounded-lg border p-1"
                                    style={{ background: theme.ui.materialElevated, borderColor: theme.ui.hairline, boxShadow: theme.ui.shadow, color: theme.node.text }}
                                >
                                    {group.nodes.map((node) => (
                                        <button
                                            key={node.id}
                                            type="button"
                                            className="creative-os-menu-item flex h-8 w-full items-center gap-2 truncate rounded-md px-2 text-left text-xs transition-colors"
                                            style={{ color: theme.node.text }}
                                            onMouseEnter={(event) => (event.currentTarget.style.background = theme.toolbar.itemHover)}
                                            onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
                                            onClick={() => {
                                                onLocateNode(node.id);
                                                setExpandedColor(null);
                                            }}
                                        >
                                            <span className="size-1.5 shrink-0 rounded-full" style={{ background: getPinColorValue(group.color) ?? group.color }} />
                                            <span className="min-w-0 flex-1 truncate">{node.title || "未命名节点"}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
