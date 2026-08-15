export type ImageDimensions = { width: number; height: number };

export function parseImageDimensions(value: string): ImageDimensions | null {
    const match = value.trim().match(/^(\d+)\s*(?:x|\*|×)\s*(\d+)$/i);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
}

export function normalizeImageSizeValue(value: unknown) {
    if (typeof value !== "string") return "";
    const text = value.trim().replace(/[：；;]/g, ":");
    if (!text) return "";
    if (text.toLowerCase() === "auto") return "auto";
    const dimensions = parseImageDimensions(text);
    if (dimensions) return `${dimensions.width}x${dimensions.height}`;
    return /^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(text) ? text : "";
}

export function extractImageSizeFromPrompt(prompt: string) {
    const dimensions = prompt.match(/(?:^|[^\d])(\d{1,5})\s*(?:x|\*|×)\s*(\d{1,5})(?!\d)/i);
    if (dimensions) return normalizeImageSizeValue(`${dimensions[1]}x${dimensions[2]}`);

    const ratio = prompt.match(/(?:比例|画幅|宽高比|尺寸)?\s*(?:为|是|[:：])?\s*(\d+(?:\.\d+)?)\s*[:：；;]\s*(\d+(?:\.\d+)?)/i);
    return ratio ? normalizeImageSizeValue(`${ratio[1]}:${ratio[2]}`) : "";
}

export function closestImageAspectRatio(width: number | undefined, height: number | undefined) {
    if (!width || !height || width <= 0 || height <= 0) return "";
    const ratio = width / height;
    const candidates = [
        ["1:1", 1],
        ["3:2", 3 / 2],
        ["2:3", 2 / 3],
        ["4:3", 4 / 3],
        ["3:4", 3 / 4],
        ["16:9", 16 / 9],
        ["9:16", 9 / 16],
    ] as const;
    return candidates.reduce((best, candidate) => (Math.abs(Math.log(ratio / candidate[1])) < Math.abs(Math.log(ratio / best[1])) ? candidate : best))[0];
}

export function resolveImageRequestSize(input: { prompt: string; configuredSize?: unknown; referenceWidth?: number; referenceHeight?: number; plannedSize?: unknown; defaultSize?: unknown }) {
    const requested = extractImageSizeFromPrompt(input.prompt);
    const configured = normalizeImageSizeValue(input.configuredSize);
    const custom = parseImageDimensions(configured) ? configured : "";
    const reference = closestImageAspectRatio(input.referenceWidth, input.referenceHeight);
    return requested || custom || reference || normalizeImageSizeValue(input.plannedSize) || configured || normalizeImageSizeValue(input.defaultSize) || "auto";
}
