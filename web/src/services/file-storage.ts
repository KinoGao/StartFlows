"use client";

import { getServerMediaBlob, parseServerMediaUrl, serverMediaUrl, uploadServerMedia, type ServerMediaType } from "@/services/server-media-storage";

export type UploadedFile = { url: string; storageKey: string; bytes: number; mimeType: string; width?: number; height?: number; durationMs?: number; remoteUrl?: string; serverUrl?: string };

export async function uploadMediaFile(input: string | Blob, prefix = "file"): Promise<UploadedFile> {
    const type = mediaType(input, prefix);
    const stored = await uploadServerMedia(input, type);
    return withMediaMeta(stored, type);
}

export async function uploadGeneratedMediaFile(input: string | Blob, type: Exclude<ServerMediaType, "image">): Promise<UploadedFile> {
    const stored = await uploadServerMedia(input, type, type === "video" ? 200 * 1024 * 1024 : 30 * 1024 * 1024);
    return withMediaMeta(stored, type);
}

export async function readStoredMediaFile(url: string, type: Exclude<ServerMediaType, "image">, mimeType: string): Promise<UploadedFile | null> {
    const reference = parseServerMediaUrl(url);
    if (!reference) return null;
    return { url: reference.url, serverUrl: reference.url, storageKey: reference.storageKey, bytes: 0, mimeType, ...(type === "video" ? await readVideoMeta(reference.url) : await readAudioMeta(reference.url)) };
}

async function withMediaMeta(stored: Awaited<ReturnType<typeof uploadServerMedia>>, type: Exclude<ServerMediaType, "image">) {
    const meta = type === "video" ? await readVideoMeta(stored.url) : await readAudioMeta(stored.url);
    return { ...stored, serverUrl: stored.url, ...meta };
}

export async function resolveMediaUrl(storageKey?: string, fallback = "") {
    return serverMediaUrl(storageKey, fallback);
}

export function getMediaBlob(storageKey: string, fallback = "") {
    return getServerMediaBlob(storageKey, fallback);
}

export async function setMediaBlob(_storageKey: string, blob: Blob) {
    return (await uploadServerMedia(blob, blob.type.startsWith("audio/") ? "audio" : "video")).url;
}

export async function deleteStoredMedia(keys: Iterable<string>) {
    const storageKeys = Array.from(new Set(Array.from(keys, (key) => key.trim()).filter(Boolean)));
    if (!storageKeys.length) return { deletedFiles: 0, blocked: [] };
    const response = await fetch("/api/media-assets", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ storageKeys }) });
    const payload = (await response.json().catch(() => ({}))) as { data?: { deletedFiles?: number; blocked?: unknown[] }; msg?: string };
    if (!response.ok) throw new Error(payload.msg || "服务器媒体删除失败");
    if (payload.data?.blocked?.length) throw new Error("部分媒体仍被会话、项目或素材库引用，服务器文件已保留");
    return payload.data || { deletedFiles: 0, blocked: [] };
}

function mediaType(input: string | Blob, prefix: string): Exclude<ServerMediaType, "image"> {
    const mimeType = input instanceof Blob ? input.type : input.match(/^data:([^;,]+)/)?.[1] || "";
    return mimeType.startsWith("audio/") || prefix.startsWith("audio") ? "audio" : "video";
}

function readVideoMeta(url: string) {
    return new Promise<{ width: number; height: number; durationMs?: number }>((resolve) => {
        const video = document.createElement("video");
        const done = () => resolve({ width: video.videoWidth || 1280, height: video.videoHeight || 720, durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined });
        video.onloadedmetadata = done;
        video.onerror = done;
        video.src = url;
    });
}

function readAudioMeta(url: string) {
    return new Promise<{ durationMs?: number }>((resolve) => {
        const audio = document.createElement("audio");
        const done = () => resolve({ durationMs: Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : undefined });
        audio.onloadedmetadata = done;
        audio.onerror = done;
        audio.src = url;
    });
}
