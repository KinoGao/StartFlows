import { spawn } from "node:child_process";
import { join, parse } from "node:path";

type FfmpegResult = { stdout: string; stderr: string };

export async function ffmpegAvailable() {
    try {
        await Promise.all([runFfmpeg(["-version"], { timeoutMs: 10_000 }), runFfprobe(["-version"], { timeoutMs: 10_000 })]);
        return true;
    } catch {
        return false;
    }
}

export function runFfmpeg(args: string[], options?: { timeoutMs?: number; cwd?: string; signal?: AbortSignal }) {
    return runProcess(resolveFfmpegPath(), args, options);
}

export function runFfprobe(args: string[], options?: { timeoutMs?: number; cwd?: string; signal?: AbortSignal }) {
    return runProcess(resolveFfprobePath(), args, options);
}

export function resolveFfprobePath() {
    const configured = process.env.FFPROBE_PATH?.trim();
    if (configured) return configured;
    const ffmpegPath = process.env.FFMPEG_PATH?.trim();
    if (!ffmpegPath) return "ffprobe";
    const parsed = parse(ffmpegPath);
    return parsed.dir ? join(parsed.dir, `ffprobe${parsed.ext}`) : "ffprobe";
}

function resolveFfmpegPath() {
    return process.env.FFMPEG_PATH?.trim() || "ffmpeg";
}

function runProcess(command: string, args: string[], options?: { timeoutMs?: number; cwd?: string; signal?: AbortSignal }): Promise<FfmpegResult> {
    return new Promise((resolve, reject) => {
        if (options?.signal?.aborted) {
            reject(new Error("FFmpeg 已取消"));
            return;
        }
        const child = spawn(command, args, { cwd: options?.cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
        let stdout = "";
        let stderr = "";
        const append = (current: string, chunk: Buffer) => `${current}${chunk.toString("utf8")}`.slice(-20_000);
        child.stdout.on("data", (chunk: Buffer) => {
            stdout = append(stdout, chunk);
        });
        child.stderr.on("data", (chunk: Buffer) => {
            stderr = append(stderr, chunk);
        });
        const timer = setTimeout(
            () => {
                child.kill("SIGKILL");
                reject(new Error("FFmpeg 执行超时"));
            },
            options?.timeoutMs || 30 * 60_000,
        );
        const onAbort = () => {
            child.kill("SIGKILL");
            clearTimeout(timer);
            reject(new Error("FFmpeg 已取消"));
        };
        options?.signal?.addEventListener("abort", onAbort, { once: true });
        child.once("error", (error) => {
            clearTimeout(timer);
            options?.signal?.removeEventListener("abort", onAbort);
            reject(error);
        });
        child.once("close", (code) => {
            clearTimeout(timer);
            options?.signal?.removeEventListener("abort", onAbort);
            if (code === 0) resolve({ stdout, stderr });
            else reject(new Error(readFfmpegError(stderr, code)));
        });
    });
}

function readFfmpegError(stderr: string, code: number | null) {
    const lines = stderr
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
    return lines.slice(-6).join("\n") || `FFmpeg 执行失败（${code ?? "unknown"}）`;
}
