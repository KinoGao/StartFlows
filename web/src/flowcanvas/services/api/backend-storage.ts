import { apiUrl } from "@/flowcanvas/constant/env";
import type { CanvasProject } from "@/flowcanvas/canvas/stores/use-canvas-store";
import type { Asset } from "@/flowcanvas/stores/use-asset-store";
import type { AiConfig } from "@/flowcanvas/stores/use-config-store";
import { useUserStore } from "@/flowcanvas/stores/use-user-store";
import { ApiError } from "./auth";

/**
 * VOZEB 适配层：FlowCanvas 的"账号工作区"接口 → VOZEB 的 canvas-projects / library-assets /
 * reference-assets API。鉴权走同源 Cookie（token 参数仅为占位，不再发 Authorization 头）。
 */

export type BackendBootstrap = {
    config: { data: string; updatedAt: string } | null;
    projects: CanvasProject[];
    projectTombstones?: Record<string, string>;
    assets: Asset[];
};

export type BackendUploadedFile = {
    storageKey: string;
    url: string;
    bytes: number;
    mimeType: string;
    fileName: string;
};

async function readApi<T>(response: Response): Promise<T> {
    let body: { code?: number; data?: unknown; msg?: string; error?: string } | null = null;
    try {
        body = (await response.json()) as { code?: number; data?: unknown; msg?: string; error?: string };
    } catch {
        body = null;
    }
    if (!response.ok || (body?.code !== undefined && body.code !== 0)) throw new ApiError(body?.msg || body?.error || `请求失败：${response.status}`, response.status);
    return (body && "data" in body ? body.data : body) as T;
}

const jsonHeaders = { "Content-Type": "application/json" };

// ===== 项目 =====

/** 服务端已确认的项目版本（PATCH 乐观并发用） */
const serverUpdatedAtById = new Map<string, string>();

async function fetchProjectFull(id: string): Promise<CanvasProject> {
    const body = await readApi<{ project: CanvasProject }>(await fetch(apiUrl(`/api/canvas/projects/${encodeURIComponent(id)}`)));
    return body.project;
}

// ===== 素材 =====

const knownAssetIds = new Set<string>();

// ===== 用户级 AI 配置（VOZEB 无对应接口，存本地） =====

function configStorageKey() {
    return `flowcanvas:user-config:${useUserStore.getState().user?.id || "anonymous"}`;
}

export async function fetchBackendBootstrap(_token: string): Promise<BackendBootstrap> {
    const summaries = await readApi<{ projects: Array<{ id: string }> }>(await fetch(apiUrl("/api/canvas/projects?pageSize=100")));
    const projects = await Promise.all((summaries.projects || []).map((item) => fetchProjectFull(item.id)));
    serverUpdatedAtById.clear();
    projects.forEach((project) => serverUpdatedAtById.set(project.id, project.updatedAt));

    const assetsBody = await readApi<{ assets: Asset[] }>(await fetch(apiUrl("/api/library-assets?pageSize=100")));
    const assets = assetsBody.assets || [];
    knownAssetIds.clear();
    assets.forEach((asset) => knownAssetIds.add(asset.id));

    const storedConfig = typeof window !== "undefined" ? window.localStorage.getItem(configStorageKey()) : null;
    return {
        config: storedConfig ? { data: storedConfig, updatedAt: "" } : null,
        projects,
        projectTombstones: {},
        assets,
    };
}

export async function pushBackendConfig(_token: string, config: AiConfig): Promise<void> {
    if (typeof window !== "undefined") window.localStorage.setItem(configStorageKey(), JSON.stringify(config));
}

/** 创建项目（服务端分配 id）：所有新建/导入入口必须先走这里，保证本地与 server id 一致。 */
export async function createCanvasProjectOnServer(title: string, project?: Partial<CanvasProject>): Promise<CanvasProject> {
    const created = await readApi<{ project: CanvasProject }>(
        await fetch(apiUrl("/api/canvas/projects"), { method: "POST", headers: jsonHeaders, body: JSON.stringify({ title, ...(project ? { project } : {}) }) }),
    );
    serverUpdatedAtById.set(created.project.id, created.project.updatedAt);
    return created.project;
}

export async function pushBackendProjects(_token: string, projects: CanvasProject[], projectTombstones: Record<string, string> = {}): Promise<void> {
    const tombstoneIds = Object.keys(projectTombstones);
    if (tombstoneIds.length) {
        await readApi(await fetch(apiUrl("/api/canvas/projects"), { method: "DELETE", headers: jsonHeaders, body: JSON.stringify({ ids: tombstoneIds }) }));
        tombstoneIds.forEach((id) => serverUpdatedAtById.delete(id));
    }
    for (const project of projects) {
        const expectedUpdatedAt = serverUpdatedAtById.get(project.id);
        if (!expectedUpdatedAt) {
            // 兜底：正常新建/导入都走 createCanvasProjectOnServer，这里只兜底异常路径
            await createCanvasProjectOnServer(project.title, project);
            continue;
        }
        const saved = await readApi<{ project: CanvasProject }>(
            await fetch(apiUrl(`/api/canvas/projects/${encodeURIComponent(project.id)}`), {
                method: "PATCH",
                headers: jsonHeaders,
                body: JSON.stringify({ project, expectedUpdatedAt }),
            }),
        );
        serverUpdatedAtById.set(project.id, saved.project.updatedAt);
    }
}

export async function pushBackendAssets(_token: string, assets: Asset[]): Promise<void> {
    const nextIds = new Set(assets.map((asset) => asset.id));
    for (const id of Array.from(knownAssetIds)) {
        if (nextIds.has(id)) continue;
        await readApi(await fetch(apiUrl(`/api/library-assets/${encodeURIComponent(id)}`), { method: "DELETE" }));
        knownAssetIds.delete(id);
    }
    for (const asset of assets) {
        if (knownAssetIds.has(id0(asset))) {
            await readApi(await fetch(apiUrl(`/api/library-assets/${encodeURIComponent(asset.id)}`), { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(asset) }));
        } else {
            await readApi(await fetch(apiUrl("/api/library-assets"), { method: "POST", headers: jsonHeaders, body: JSON.stringify(asset) }));
            knownAssetIds.add(asset.id);
        }
    }
}

function id0(asset: Asset) {
    return asset.id;
}

// ===== 生成记录（v1 未接入 VOZEB generation-logs，返回空） =====

export type GenerationLogKind = "image" | "video" | "chat" | "agentrun";

export async function fetchBackendGenerationLogs<T>(_token: string, _kind: GenerationLogKind): Promise<T[]> {
    return [];
}

export async function putBackendGenerationLog<T>(_token: string, _kind: GenerationLogKind, _id: string, _log: T): Promise<void> {}

export async function deleteBackendGenerationLog(_token: string, _kind: GenerationLogKind, _id: string): Promise<void> {}

// ===== 媒体文件 =====

async function blobToDataUrl(blob: Blob): Promise<string | null> {
    if (typeof FileReader === "undefined") return null;
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onerror = () => resolve(null);
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
        reader.readAsDataURL(blob);
    });
}

function mediaKindOf(mimeType: string): "image" | "video" | "audio" {
    if (mimeType.startsWith("video/")) return "video";
    if (mimeType.startsWith("audio/")) return "audio";
    return "image";
}

export async function uploadBackendFile(_token: string, blob: Blob, fileName = "file"): Promise<BackendUploadedFile> {
    const dataUrl = await blobToDataUrl(blob);
    if (!dataUrl) throw new Error("文件读取失败");
    const uploaded = await readApi<{ url: string; token: string; bytes?: number; mimeType?: string }>(
        await fetch(apiUrl("/api/reference-assets"), {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({ dataUrl, type: mediaKindOf(blob.type), persistent: true, originalName: fileName }),
        }),
    );
    const storageKey = `backend:${uploaded.token}`;
    const url = absoluteMediaUrl(uploaded.url);
    cacheBackendFileUrl(storageKey, url, _token);
    return { storageKey, url, bytes: uploaded.bytes ?? blob.size, mimeType: uploaded.mimeType || blob.type || "application/octet-stream", fileName };
}

function absoluteMediaUrl(url: string) {
    if (/^https?:\/\//i.test(url)) return url;
    if (typeof window === "undefined") return url;
    return new URL(url, window.location.origin).toString();
}

export function mediaUrlForStorageKey(storageKey: string) {
    if (!storageKey.startsWith("backend:")) return "";
    return absoluteMediaUrl(`/api/reference-assets/${storageKey.slice("backend:".length)}`);
}

// ===== 签名 URL 缓存（VOZEB 下读取不需要签名，缓存层保留接口形状） =====

type BackendFileUrlCacheEntry = { url: string; expiresAt: number; token: string };
const backendFileUrlCache = new Map<string, BackendFileUrlCacheEntry>();
const pendingBackendFileUrls = new Map<string, Promise<string>>();

export function cacheBackendFileUrl(storageKey: string, url: string, token: string) {
    if (!storageKey.startsWith("backend:") || !url) return "";
    const normalizedUrl = absoluteMediaUrl(url);
    backendFileUrlCache.set(storageKey, { url: normalizedUrl, expiresAt: Date.now() + 55 * 60_000, token });
    return normalizedUrl;
}

export function peekBackendFileUrl(storageKey: string, token: string) {
    if (!storageKey.startsWith("backend:") || !token) return undefined;
    const cached = backendFileUrlCache.get(storageKey);
    if (cached) return cached.url;
    return mediaUrlForStorageKey(storageKey) || undefined;
}

export function clearBackendFileUrlCache() {
    backendFileUrlCache.clear();
    pendingBackendFileUrls.clear();
}

export async function signBackendFiles(token: string, storageKeys: Iterable<string>) {
    if (!token) throw new Error("请先登录后端账号");
    return new Map(
        Array.from(new Set(storageKeys)).flatMap((storageKey) => {
            const url = peekBackendFileUrl(storageKey, token);
            return url ? [[storageKey, url] as const] : [];
        }),
    );
}

export async function resolveBackendFileUrl(storageKey: string, token: string) {
    if (!storageKey.startsWith("backend:") || !token) return "";
    const cached = peekBackendFileUrl(storageKey, token);
    if (cached) return cached;
    throw new Error(`后端媒体文件不存在：${storageKey}`);
}

export function replaceBackendStorageReferences<T>(value: T, uploads: ReadonlyMap<string, BackendUploadedFile>, token: string): T {
    const visit = (input: unknown): unknown => {
        if (Array.isArray(input)) return input.map(visit);
        if (!input || typeof input !== "object") return input;

        const source = input as Record<string, unknown>;
        const next = Object.fromEntries(Object.entries(source).map(([key, item]) => [key, visit(item)]));
        const storageKey = typeof source.storageKey === "string" ? source.storageKey : "";
        const uploaded = uploads.get(storageKey);
        if (!uploaded) return next;

        const url = cacheBackendFileUrl(uploaded.storageKey, uploaded.url, token);
        next.storageKey = uploaded.storageKey;
        next.bytes = uploaded.bytes;
        next.mimeType = uploaded.mimeType;
        for (const key of ["content", "dataUrl", "url", "coverUrl"]) {
            if (typeof source[key] === "string") next[key] = url;
        }
        return next;
    };

    return visit(value) as T;
}
