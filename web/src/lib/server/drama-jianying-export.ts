import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, relative } from "node:path";

import { AudioMaterial, AudioSegment, ClipSettings, DraftFolder, TextSegment, TextStyle, TrackType, VideoMaterial, VideoSegment, trange } from "jsjianyingdraft";
import { zipSync } from "fflate";

import type { DramaEpisode, DramaProject } from "@/lib/drama-project-contract";
import { dramaOutputDimensions } from "@/lib/drama-image-size";
import { downloadMediaToFile } from "@/lib/server/media-download";

const MAX_MEDIA_BYTES = 200 * 1024 * 1024;

export async function exportDramaEpisodeAsJianying(input: { project: DramaProject; episode: DramaEpisode; draftPath: string; version: "5" | "6"; origin: string; cookie?: string }) {
    const clips = input.episode.shots.filter((shot) => shot.videoUrl);
    if (!clips.length) throw new DramaJianyingExportError("本集还没有可导出的视频", 422);
    const draftPath = normalizeDraftPath(input.draftPath);
    const draftName = buildJianyingDraftName(input.project.title, input.episode.title);
    const root = await mkdtemp(join(tmpdir(), "vozeb-jianying-"));
    try {
        const draftRoot = join(root, "drafts");
        await mkdir(draftRoot, { recursive: true });
        const folder = new DraftFolder(draftRoot);
        const { width, height } = dramaOutputDimensions(input.project.ratio, 1920, 1080);
        const script = folder.createDraft(draftName, width, height, { allowReplace: true });
        const draftDir = join(draftRoot, draftName);
        const assetsDir = join(draftDir, "assets");
        await mkdir(assetsDir, { recursive: true });
        script.addTrack(TrackType.video);
        if (clips.some((shot) => shot.audioUrl)) script.addTrack(TrackType.audio, "配音");
        if (clips.some((shot) => (shot.subtitle || shot.dialogue || shot.narration).trim())) script.addTrack(TrackType.text, "字幕");
        const textStyle = new TextStyle({ size: height > width ? 12 : 8, color: [1, 1, 1], align: 1, bold: true, autoWrapping: true, maxLineWidth: height > width ? 0.82 : 0.62 });
        const textPosition = new ClipSettings({ transformY: height > width ? -0.75 : -0.8 });
        let offset = 0;
        let totalBytes = 0;
        for (const [index, shot] of clips.entries()) {
            const duration = Math.max(1, shot.duration) * 1_000_000;
            const videoPath = join(assetsDir, `segment_${String(index + 1).padStart(3, "0")}.mp4`);
            const downloadedVideo = await downloadMediaToFile(shot.videoUrl!, videoPath, { origin: input.origin, cookie: input.cookie, maxBytes: MAX_MEDIA_BYTES });
            totalBytes += downloadedVideo.bytes;
            if (totalBytes > MAX_MEDIA_BYTES) throw new DramaJianyingExportError("剪映导出素材超过 200MB，请减少镜头后重试", 413);
            script.addSegment(new VideoSegment(new VideoMaterial(videoPath, { duration, width, height }), trange(offset, duration)));
            if (shot.audioUrl) {
                const audioPath = join(assetsDir, `audio_${String(index + 1).padStart(3, "0")}${audioExtension(shot.audioUrl)}`);
                const downloadedAudio = await downloadMediaToFile(shot.audioUrl, audioPath, { origin: input.origin, cookie: input.cookie, maxBytes: 20 * 1024 * 1024 });
                totalBytes += downloadedAudio.bytes;
                script.addSegment(new AudioSegment(new AudioMaterial(audioPath, { duration }), trange(offset, duration)), "配音");
            }
            const subtitle = (shot.subtitle || shot.dialogue || shot.narration).trim();
            if (subtitle) script.addSegment(new TextSegment(subtitle, trange(offset, duration), { style: textStyle, clipSettings: textPosition }), "字幕");
            offset += duration;
        }
        script.save();
        const contentPath = join(draftDir, "draft_content.json");
        await replaceDraftPaths(contentPath, assetsDir, `${draftPath.replace(/[\\/]+$/, "")}/${draftName}/assets`);
        if (input.version === "6") await rename(contentPath, join(draftDir, "draft_info.json"));
        const entries = await collectZipEntries(draftDir, draftName);
        return { data: zipSync(entries, { level: 0 }), fileName: `${draftName}_剪映草稿.zip` };
    } finally {
        await rm(root, { recursive: true, force: true });
    }
}

export function buildJianyingDraftName(projectTitle: string, episodeTitle: string) {
    const title = safeName(projectTitle) || "短剧项目";
    const episode = safeName(episodeTitle) || "第1集";
    return `${title}_${episode}`.slice(0, 100);
}

function normalizeDraftPath(value: string) {
    const path = value.trim();
    if (!path || path.length > 1024 || /[\u0000-\u001f]/.test(path) || (!/^[A-Za-z]:[\\/]/.test(path) && !path.startsWith("/"))) throw new DramaJianyingExportError("请填写有效的剪映草稿绝对路径", 400);
    return path;
}

function safeName(value: string) {
    return value
        .trim()
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/\.\.+/g, "_")
        .replace(/[. ]+$/g, "");
}

function audioExtension(url: string) {
    const extension = extname(new URL(url, "http://local").pathname).toLowerCase();
    return [".wav", ".m4a", ".aac", ".ogg"].includes(extension) ? extension : ".mp3";
}

async function replaceDraftPaths(jsonPath: string, from: string, to: string) {
    const data = JSON.parse(await readFile(jsonPath, "utf8")) as unknown;
    const replace = (value: unknown): unknown => {
        if (typeof value === "string") return value.includes(from) ? value.replaceAll(from, to) : value;
        if (Array.isArray(value)) return value.map(replace);
        if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
        return value;
    };
    await writeFile(jsonPath, JSON.stringify(replace(data)), "utf8");
}

async function collectZipEntries(directory: string, draftName: string) {
    const entries: Record<string, Uint8Array> = {};
    const walk = async (current: string) => {
        for (const entry of await readdir(current, { withFileTypes: true })) {
            const path = join(current, entry.name);
            if (entry.isDirectory()) await walk(path);
            else entries[`${draftName}/${relative(directory, path).replaceAll("\\", "/")}`] = new Uint8Array(await readFile(path));
        }
    };
    await walk(directory);
    return entries;
}

export class DramaJianyingExportError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}
