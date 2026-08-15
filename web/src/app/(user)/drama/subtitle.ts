import type { DramaShot } from "./types";

export function buildSubtitleCues(shots: DramaShot[]) {
    let cursor = 0;
    return shots
        .flatMap((shot) => {
            const duration = Math.max(1, Number(shot.duration) || 5) * 1000;
            const startMs = cursor;
            cursor += duration;
            const text = (shot.subtitle || shot.dialogue).trim();
            return text ? [{ index: 0, startMs, endMs: cursor, text }] : [];
        })
        .map((cue, index) => ({ ...cue, index: index + 1 }));
}

export function buildSrt(shots: DramaShot[]) {
    return buildSubtitleCues(shots)
        .map((cue) => `${cue.index}\n${formatSrtTime(cue.startMs)} --> ${formatSrtTime(cue.endMs)}\n${cue.text}`)
        .join("\n\n");
}

export function formatTimelineTime(milliseconds: number) {
    const seconds = Math.max(0, Math.floor(milliseconds / 1000));
    return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatSrtTime(milliseconds: number) {
    const value = Math.max(0, Math.floor(milliseconds));
    const hours = Math.floor(value / 3_600_000);
    const minutes = Math.floor((value % 3_600_000) / 60_000);
    const seconds = Math.floor((value % 60_000) / 1000);
    const millis = value % 1000;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}
