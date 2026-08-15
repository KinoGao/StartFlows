export function resolveImageTaskOptions(config: { quality?: unknown; size?: unknown }, defaults: { imageQuality: string; imageSize: string }) {
    return {
        quality: text(config.quality) || defaults.imageQuality,
        size: text(config.size) || defaults.imageSize,
    };
}

export function resolveImageGenerationCount(value: unknown) {
    const count = Number(value);
    return Math.max(1, Number.isSafeInteger(count) && count > 0 ? Math.floor(count) : 1);
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}
