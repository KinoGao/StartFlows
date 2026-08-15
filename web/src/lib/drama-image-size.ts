import { normalizeImageSizeValue, parseImageDimensions, resolveImageRequestSize } from "@/lib/image-size";

const DRAMA_RATIOS = new Set(["9:16", "16:9"]);

export function normalizeDramaImageSize(value: unknown) {
    const normalized = normalizeImageSizeValue(value);
    if (DRAMA_RATIOS.has(normalized)) return normalized;
    const dimensions = parseImageDimensions(normalized);
    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) return "";
    return normalized;
}

export function resolveDramaGenerationSize(input: { projectSize: string; prompt: string; references?: Array<{ width?: number; height?: number }> }) {
    const reference = input.references?.find((item) => item.width && item.height);
    return resolveImageRequestSize({
        prompt: input.prompt,
        configuredSize: normalizeDramaImageSize(input.projectSize),
        referenceWidth: reference?.width,
        referenceHeight: reference?.height,
        defaultSize: input.projectSize,
    });
}

export function dramaOutputDimensions(size: string, landscapeWidth = 1280, landscapeHeight = 720) {
    const dimensions = parseImageDimensions(normalizeDramaImageSize(size));
    if (dimensions) return dimensions;
    return size === "16:9" ? { width: landscapeWidth, height: landscapeHeight } : { width: landscapeHeight, height: landscapeWidth };
}
