type PublicModelCapability = "image" | "video" | "text" | "audio";

export function resolvePublicCapabilityModels(logicalModels: Array<{ id: string; capability: PublicModelCapability }>, fallback: Record<PublicModelCapability, string[]>) {
    return Object.fromEntries(
        (Object.keys(fallback) as PublicModelCapability[]).map((capability) => {
            const logical = logicalModels.filter((model) => model.capability === capability).map((model) => model.id);
            return [capability, logical.length ? logical : fallback[capability]];
        }),
    ) as Record<PublicModelCapability, string[]>;
}

export function flattenPublicCapabilityModels(models: Record<PublicModelCapability, string[]>) {
    return Array.from(new Set([models.image, models.video, models.text, models.audio].flat()));
}
