import type { CreativeAsset, CreativeMessage } from "@/lib/creative-runtime-contract";

import { parseCreativeAspectRatio } from "./creative-asset-layout";

export type CreativeVideoPresentation = {
    coverUrl?: string;
    resolution?: string;
    ratio?: string;
};

export function creativeVideoPresentation(message: CreativeMessage, asset: CreativeAsset, fallbackResolution?: string, fallbackRatio?: string): CreativeVideoPresentation {
    const sources = [record(asset.metadata.generation), asset.metadata, record(message.metadata.generation), message.metadata].filter((item): item is Record<string, unknown> => Boolean(item));
    return {
        coverUrl: firstMediaUrl(sources, ["coverUrl", "posterUrl", "poster", "thumbnail", "thumbnailUrl", "firstFrame"]),
        resolution: normalizeResolution(firstText(sources, ["resolution"]) || fallbackResolution),
        ratio: firstRatio(sources) || normalizeRatio(fallbackRatio),
    };
}

export function formatVideoTime(value: number) {
    const seconds = Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
    const minutes = Math.floor(seconds / 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function firstMediaUrl(sources: Record<string, unknown>[], keys: string[]) {
    for (const source of sources) {
        for (const key of keys) {
            const url = safeMediaUrl(source[key]);
            if (url) return url;
        }
    }
    return undefined;
}

function firstText(sources: Record<string, unknown>[], keys: string[]) {
    for (const source of sources) {
        for (const key of keys) {
            const value = cleanText(source[key], 32);
            if (value) return value;
        }
    }
    return undefined;
}

function firstRatio(sources: Record<string, unknown>[]) {
    for (const source of sources) {
        for (const key of ["ratio", "aspectRatio", "size"] as const) {
            const ratio = normalizeRatio(source[key]);
            if (ratio) return ratio;
        }
    }
    return undefined;
}

function normalizeRatio(value: unknown) {
    if (typeof value !== "string" || !parseCreativeAspectRatio(value)) return undefined;
    const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(?::|\/|x|×|\*)\s*(\d+(?:\.\d+)?)$/i);
    return match ? `${Number(match[1])}:${Number(match[2])}` : undefined;
}

function normalizeResolution(value: unknown) {
    const resolution = cleanText(value, 32);
    if (!resolution || /^(auto|high|medium|low)$/i.test(resolution)) return undefined;
    return /^\d{3,4}$/i.test(resolution) ? `${resolution}P` : resolution.toUpperCase();
}

function safeMediaUrl(value: unknown) {
    const url = cleanText(value, 4000);
    return /^(?:https?:\/\/|\/|data:image\/|blob:)/i.test(url) ? url : undefined;
}

function record(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function cleanText(value: unknown, maxLength: number) {
    return typeof value === "string" ? Array.from(value.trim()).slice(0, maxLength).join("") : "";
}
