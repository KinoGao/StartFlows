import { normalizeDramaShotAudioMode } from "@/lib/server/drama-render-audio";
import { resolveDramaShotDuration } from "@/lib/server/drama-shot-config";

export type NormalizedDramaRenderShot = {
    videoUrl: string;
    audioMode: ReturnType<typeof normalizeDramaShotAudioMode>;
    audioUrl: string;
    subtitle: string;
    duration: number;
};

export function normalizeDramaRenderShots(value: unknown): NormalizedDramaRenderShot[] {
    return array(value).map((shot) => {
        const item = object(shot);
        return {
            videoUrl: text(item.videoUrl),
            audioMode: normalizeDramaShotAudioMode(item.audioMode),
            audioUrl: text(item.audioUrl),
            subtitle: text(item.subtitle),
            duration: resolveDramaShotDuration(item.duration, 5),
        };
    });
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}
