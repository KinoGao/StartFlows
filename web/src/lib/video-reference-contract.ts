export const videoReferenceRoles = ["reference", "first_frame", "last_frame"] as const;
export type VideoReferenceRole = (typeof videoReferenceRoles)[number];

export const creativeVideoReferenceModes = ["reference", "first_frame", "first_last"] as const;
export type CreativeVideoReferenceMode = (typeof creativeVideoReferenceModes)[number];

export type VideoGenerationReference = {
    type: "image" | "video" | "audio";
    url: string;
    role?: VideoReferenceRole;
};

export function normalizeVideoReferenceRole(value: unknown): VideoReferenceRole | undefined {
    return typeof value === "string" && videoReferenceRoles.includes(value.trim() as VideoReferenceRole) ? (value.trim() as VideoReferenceRole) : undefined;
}

export function normalizeVideoGenerationReferences(value: unknown): VideoGenerationReference[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) throw new Error("视频参考素材格式不正确");
    const references: VideoGenerationReference[] = [];
    for (const item of value) {
        if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("视频参考素材格式不正确");
        const source = item as Record<string, unknown>;
        const type = source.type === "image" || source.type === "video" || source.type === "audio" ? source.type : undefined;
        const url = typeof source.url === "string" ? source.url.trim() : "";
        const role = source.role === undefined ? "reference" : normalizeVideoReferenceRole(source.role);
        if (!type || !url || !role) throw new Error("视频参考素材类型、地址或角色不正确");
        if (role !== "reference" && type !== "image") throw new Error("视频首尾帧只能使用图片素材");
        references.push({ type, url, role });
    }
    const firstFrames = references.filter((reference) => reference.role === "first_frame");
    const lastFrames = references.filter((reference) => reference.role === "last_frame");
    if (firstFrames.length > 1) throw new Error("一次只能指定一张首帧图片");
    if (lastFrames.length > 1) throw new Error("一次只能指定一张尾帧图片");
    if (lastFrames.length && !firstFrames.length) throw new Error("指定尾帧时必须同时指定首帧");
    if (firstFrames.length && lastFrames.length && firstFrames[0].url === lastFrames[0].url) throw new Error("首帧和尾帧不能使用同一张图片");
    return Array.from(new Map(references.map((reference) => [`${reference.type}:${reference.role}:${reference.url}`, reference])).values());
}

export function videoFrameAssetIds(input: { firstFrameAssetId?: string; lastFrameAssetId?: string } | undefined) {
    return Array.from(new Set([input?.firstFrameAssetId, input?.lastFrameAssetId].filter((id): id is string => Boolean(id))));
}

export function videoFrameReferences(references: readonly VideoGenerationReference[]) {
    return {
        firstFrame: references.find((reference) => reference.role === "first_frame"),
        lastFrame: references.find((reference) => reference.role === "last_frame"),
    };
}

export function regularVideoReferences(references: readonly VideoGenerationReference[]) {
    return references.filter((reference) => reference.role !== "first_frame" && reference.role !== "last_frame");
}
