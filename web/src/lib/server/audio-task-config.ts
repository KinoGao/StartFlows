export function resolveAudioTaskOptions(config: { voice?: unknown; format?: unknown; speed?: unknown } | undefined, defaults: { audioVoice: string; audioFormat: string }) {
    return {
        voice: clean(config?.voice, 80) || defaults.audioVoice,
        format: clean(config?.format, 16) || defaults.audioFormat,
        speed: clean(config?.speed, 16) || "1",
    };
}

function clean(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}
