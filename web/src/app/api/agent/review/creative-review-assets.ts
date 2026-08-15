const MAX_REVIEW_SOURCE_LENGTH = 8_000_000;

export function normalizeCreativeReviewAssets(value: unknown, workspace: "image" | "video") {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return [];
        const record = item as Record<string, unknown>;
        const id = typeof record.id === "string" ? record.id.trim().slice(0, 120) : "";
        const url = typeof record.url === "string" ? record.url.trim() : "";
        if (!id || !url || url.length > MAX_REVIEW_SOURCE_LENGTH) return [];
        const allowed = workspace === "image" ? /^data:image\//i.test(url) || url.startsWith("/api/") || /^https:\/\//i.test(url) : url.startsWith("/api/") || /^https:\/\//i.test(url);
        if (!allowed) return [];
        return [{ id, url }];
    });
}
