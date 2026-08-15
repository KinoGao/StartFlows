"use client";

export const IMAGE_NODE_SIZE_RANGE = {
    minLongEdge: 160,
    maxWidth: 640,
    maxHeight: 640,
} as const;

export const VIDEO_NODE_SIZE_RANGE = {
    minLongEdge: 180,
    maxWidth: 640,
    maxHeight: 480,
} as const;

export function fitNodeSize(
    width: number,
    height: number,
    maxWidth: number = IMAGE_NODE_SIZE_RANGE.maxWidth,
    maxHeight: number = IMAGE_NODE_SIZE_RANGE.maxHeight,
    minLongEdge: number = IMAGE_NODE_SIZE_RANGE.minLongEdge,
) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    const maxScale = Math.min(1, maxWidth / w, maxHeight / h);
    const minScale = minLongEdge / Math.max(w, h);
    const scale = Math.max(maxScale, minScale);
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
