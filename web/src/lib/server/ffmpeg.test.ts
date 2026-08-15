import { afterEach, describe, expect, it } from "vitest";
import { join } from "node:path";

import { resolveFfprobePath } from "./ffmpeg";

const originalFfmpegPath = process.env.FFMPEG_PATH;
const originalFfprobePath = process.env.FFPROBE_PATH;

describe("FFmpeg runtime paths", () => {
    afterEach(() => {
        restoreEnv("FFMPEG_PATH", originalFfmpegPath);
        restoreEnv("FFPROBE_PATH", originalFfprobePath);
    });

    it("prefers an explicitly configured FFprobe path", () => {
        process.env.FFMPEG_PATH = join("tools", "ffmpeg.exe");
        process.env.FFPROBE_PATH = join("custom", "probe.exe");

        expect(resolveFfprobePath()).toBe(join("custom", "probe.exe"));
    });

    it("uses the FFmpeg sibling when only a portable FFmpeg path is configured", () => {
        process.env.FFMPEG_PATH = join("tools", "ffmpeg.exe");
        delete process.env.FFPROBE_PATH;

        expect(resolveFfprobePath()).toBe(join("tools", "ffprobe.exe"));
    });

    it("uses the system command when FFmpeg is configured by command name", () => {
        process.env.FFMPEG_PATH = "ffmpeg-custom";
        delete process.env.FFPROBE_PATH;

        expect(resolveFfprobePath()).toBe("ffprobe");
    });
});

function restoreEnv(name: "FFMPEG_PATH" | "FFPROBE_PATH", value: string | undefined) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
}
