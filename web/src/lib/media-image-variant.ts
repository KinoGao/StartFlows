export const IMAGE_PREVIEW_WIDTHS = [64, 96, 128, 256, 320, 480, 640, 960, 1280, 1600, 1920, 2048] as const;

export function normalizeImagePreviewWidth(value: unknown, fallback = 1600) {
    const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
    const fallbackWidth = Number.isFinite(fallback) ? fallback : 1600;
    const requested = Math.max(IMAGE_PREVIEW_WIDTHS[0], Math.min(IMAGE_PREVIEW_WIDTHS.at(-1)!, Math.round(Number.isFinite(parsed) ? parsed : fallbackWidth)));
    return IMAGE_PREVIEW_WIDTHS.find((width) => width >= requested) || IMAGE_PREVIEW_WIDTHS.at(-1)!;
}
