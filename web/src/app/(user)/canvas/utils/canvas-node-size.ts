"use client";

import type { CanvasNodeData } from "../types";

export function fitNodeSize(width: number, height: number, maxWidth = 640, maxHeight = 640) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const scale = Math.min(1, maxWidth / w, maxHeight / h);
    return { width: w * scale, height: h * scale };
}

export function nodeSizeFromRatio(size: string, baseWidth: number, baseHeight: number) {
    const match = size?.match(/^(\d+)(?:x|:)(\d+)/);
    if (!match) return null;
    const width = Number(match[1]);
    const height = Number(match[2]);
    const ratio = width / Math.max(1, height);
    if (ratio < 0.25 || ratio > 4) return { width: baseWidth, height: baseHeight };
    return ratio >= baseWidth / baseHeight ? { width: baseWidth, height: baseWidth / ratio } : { width: baseHeight * ratio, height: baseHeight };
}

export function fitNodeAspectRatio(width: number, height: number, maxWidth: number, maxHeight: number) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const scale = Math.min(maxWidth / w, maxHeight / h);
    return { width: w * scale, height: h * scale };
}

export function resizeImageNodeToNaturalRatio(node: CanvasNodeData, naturalWidth: number, naturalHeight: number) {
    const dimensionsChanged = node.metadata?.naturalWidth !== naturalWidth || node.metadata?.naturalHeight !== naturalHeight;
    const metadata = dimensionsChanged ? { ...node.metadata, naturalWidth, naturalHeight } : node.metadata;
    if (!Number.isFinite(naturalWidth) || naturalWidth <= 0 || !Number.isFinite(naturalHeight) || naturalHeight <= 0 || node.metadata?.freeResize) return dimensionsChanged ? { ...node, metadata } : node;

    const currentRatio = node.width / Math.max(1, node.height);
    const naturalRatio = naturalWidth / naturalHeight;
    if (Math.abs(currentRatio - naturalRatio) / naturalRatio < 0.01) return dimensionsChanged ? { ...node, metadata } : node;

    const maxEdge = Math.max(node.width, node.height);
    const size = fitNodeAspectRatio(naturalWidth, naturalHeight, maxEdge, maxEdge);
    const center = { x: node.position.x + node.width / 2, y: node.position.y + node.height / 2 };
    return {
        ...node,
        width: size.width,
        height: size.height,
        position: { x: center.x - size.width / 2, y: center.y - size.height / 2 },
        metadata,
    };
}
