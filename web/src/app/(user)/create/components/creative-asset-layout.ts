import type { CSSProperties } from "react";

import type { CreativeAsset } from "@/lib/creative-runtime-contract";

export type CreativeAssetLayoutVariant = "compact" | "image-result" | "video-result";

export type CreativeAssetLayout = {
    width: number;
    height: number;
    aspectRatio: number;
    container: CSSProperties;
    media: CSSProperties;
};

type CreativeAssetLayoutOptions = {
    variant?: CreativeAssetLayoutVariant;
    ratio?: string;
};

const COMPACT_BOUNDS = { maxWidth: 200, maxHeight: 240 };
export const CREATIVE_RESULT_VIEWPORT_MAX_HEIGHT = 100 / 3;

export function creativeAssetLayout(asset: Pick<CreativeAsset, "width" | "height">, options: CreativeAssetLayoutOptions = {}): CreativeAssetLayout | null {
    const variant = options.variant || "compact";
    const sourceWidth = positiveNumber(asset.width);
    const sourceHeight = positiveNumber(asset.height);
    const sourceRatio = sourceWidth && sourceHeight ? sourceWidth / sourceHeight : undefined;
    const aspectRatio = sourceRatio || parseCreativeAspectRatio(options.ratio) || fallbackRatio(variant);
    if (!aspectRatio) return null;

    const bounds = resultBounds(variant, aspectRatio);
    const size = sourceWidth && sourceHeight ? fitSourceSize(sourceWidth, sourceHeight, bounds) : fitRatio(aspectRatio, bounds);
    const width = variant === "compact" ? `${size.width}px` : `min(${size.width}px, ${formatCssNumber(aspectRatio * CREATIVE_RESULT_VIEWPORT_MAX_HEIGHT)}dvh)`;
    return {
        ...size,
        aspectRatio,
        container: {
            width,
            maxWidth: "100%",
            aspectRatio: `${size.width} / ${size.height}`,
        },
        media: { width: "100%", height: "100%" },
    };
}

export function parseCreativeAspectRatio(value: unknown) {
    if (typeof value !== "string") return undefined;
    const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(?::|\/|x|×|\*)\s*(\d+(?:\.\d+)?)$/i);
    if (!match) return undefined;
    const width = Number(match[1]);
    const height = Number(match[2]);
    return width > 0 && height > 0 ? width / height : undefined;
}

function resultBounds(variant: CreativeAssetLayoutVariant, ratio: number) {
    if (variant === "compact") return COMPACT_BOUNDS;
    if (variant === "video-result") {
        if (ratio < 0.68) return { maxWidth: 300, maxHeight: 533 };
        if (ratio <= 1.12) return { maxWidth: 420, maxHeight: 420 };
        if (ratio < 1.5) return { maxWidth: 500, maxHeight: 400 };
        return { maxWidth: 520, maxHeight: 360 };
    }
    if (ratio <= 0.4) return { maxWidth: 320 };
    if (ratio < 0.68) return { maxWidth: 300, maxHeight: 533 };
    if (ratio < 0.9) return { maxWidth: 360, maxHeight: 480 };
    if (ratio <= 1.12) return { maxWidth: 420, maxHeight: 420 };
    return { maxWidth: 560, maxHeight: 420 };
}

function fitSourceSize(sourceWidth: number, sourceHeight: number, bounds: { maxWidth: number; maxHeight?: number }) {
    const scale = Math.min(1, bounds.maxWidth / sourceWidth, bounds.maxHeight ? bounds.maxHeight / sourceHeight : Number.POSITIVE_INFINITY);
    return roundedSize(sourceWidth * scale, sourceHeight * scale);
}

function fitRatio(ratio: number, bounds: { maxWidth: number; maxHeight?: number }) {
    let width = bounds.maxWidth;
    let height = width / ratio;
    if (bounds.maxHeight && height > bounds.maxHeight) {
        height = bounds.maxHeight;
        width = height * ratio;
    }
    return roundedSize(width, height);
}

function roundedSize(width: number, height: number) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}

function positiveNumber(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : undefined;
}

function formatCssNumber(value: number) {
    return Number(value.toFixed(6));
}

function fallbackRatio(variant: CreativeAssetLayoutVariant) {
    if (variant === "image-result") return 1;
    if (variant === "video-result") return 16 / 9;
    return undefined;
}
