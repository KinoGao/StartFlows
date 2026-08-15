"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "antd";

import { useCanvasStore, type CanvasProject } from "@/flowcanvas/canvas/stores/use-canvas-store";
import { ApiError, fetchCurrentUser } from "@/flowcanvas/services/api/auth";
import { clearBackendFileUrlCache, fetchBackendBootstrap, pushBackendAssets, pushBackendConfig, pushBackendProjects, signBackendFiles, uploadBackendFile } from "@/flowcanvas/services/api/backend-storage";
import { invalidateImageModelCapabilities, invalidateVideoModelCapabilities } from "@/flowcanvas/services/api/model-capabilities";
import { fetchRuntimeConfig } from "@/flowcanvas/services/api/platform-admin";
import { reconcileConfigWithRuntime } from "@/flowcanvas/services/runtime-config";
import { getMediaBlob } from "@/flowcanvas/services/file-storage";
import { getImageBlob } from "@/flowcanvas/services/image-storage";
import { useAssetStore, type Asset } from "@/flowcanvas/stores/use-asset-store";
import { defaultConfig, useConfigStore, type AiConfig } from "@/flowcanvas/stores/use-config-store";
import { useUserStore } from "@/flowcanvas/stores/use-user-store";

type Tombstones = Record<string, string>;
type SyncKind = "config" | "projects" | "assets";
type BackendUpload = Awaited<ReturnType<typeof uploadBackendFile>>;
type LegacyMigrationContext = {
    uploads: Map<string, Promise<BackendUpload>>;
    missingStorageKeys: Set<string>;
    onMissing: (storageKey: string) => void;
};

class LegacyMediaMissingError extends Error {
    constructor(readonly storageKey: string) {
        super("Legacy media file is missing: " + storageKey);
        this.name = "LegacyMediaMissingError";
    }
}

const BACKEND_SYNC_DEBOUNCE_MS = 500;
const BACKEND_BOOTSTRAP_RETRY_MS = 5000;
const BACKEND_PUSH_RETRY_MS = 5000;

export function useBackendWorkspaceSync() {
    const { message } = App.useApp();
    const userHydrated = useUserStore((state) => state.hydrated);
    const userId = useUserStore((state) => state.user?.id || "");
    const token = useUserStore((state) => state.token);
    const saveMode = useUserStore((state) => state.saveMode);
    const updateUser = useUserStore((state) => state.updateUser);
    const clearSession = useUserStore((state) => state.clearSession);
    const setWorkspaceState = useUserStore((state) => state.setWorkspaceState);
    const projects = useCanvasStore((state) => state.projects);
    const projectTombstones = useCanvasStore((state) => state.projectTombstones);
    const assets = useAssetStore((state) => state.assets);
    const config = useConfigStore((state) => state.config);
    const replaceProjects = useCanvasStore((state) => state.replaceProjects);
    const replaceAssets = useAssetStore((state) => state.replaceAssets);
    const replaceConfig = useConfigStore((state) => state.replaceConfig);

    const readyRef = useRef(false);
    const applyingRef = useRef(false);
    const bootstrappedUserRef = useRef("");
    const versionRef = useRef({ config: 0, projects: 0, assets: 0 });
    const lastPushedVersionRef = useRef({ config: -1, projects: -1, assets: -1 });
    const pushingRef = useRef({ config: false, projects: false, assets: false });
    const pushFailuresRef = useRef(new Set<SyncKind>());
    const missingLegacyStorageKeysRef = useRef(new Set<string>());
    const bootstrapFailureNotifiedRef = useRef(false);
    const [bootstrapRetryTick, setBootstrapRetryTick] = useState(0);
    const [pushRetryTick, setPushRetryTick] = useState(0);
    const pushRetryTimerRef = useRef<number | undefined>(undefined);

    const schedulePushRetry = useCallback(() => {
        if (pushRetryTimerRef.current !== undefined) return;
        pushRetryTimerRef.current = window.setTimeout(() => {
            pushRetryTimerRef.current = undefined;
            setPushRetryTick((value) => value + 1);
        }, BACKEND_PUSH_RETRY_MS);
    }, []);

    const handlePushFailure = useCallback(
        (kind: SyncKind, error: unknown) => {
            if (isAuthError(error)) {
                clearSession();
                message.warning("登录已失效，请重新登录");
                return;
            }
            pushFailuresRef.current.add(kind);
            const errorMessage = error instanceof Error ? error.message : "后端工作区自动保存失败";
            // The workspace has already bootstrapped. A transient autosave failure
            // must not unmount the live canvas and discard unsaved in-memory edits.
            setWorkspaceState("ready", errorMessage);
            console.error("[backend-sync] " + kind + " push failed", error);
            schedulePushRetry();
        },
        [clearSession, message, schedulePushRetry, setWorkspaceState],
    );

    const handlePushSuccess = useCallback(
        (kind: SyncKind) => {
            pushFailuresRef.current.delete(kind);
            if (readyRef.current && pushFailuresRef.current.size === 0) setWorkspaceState("ready");
        },
        [setWorkspaceState],
    );

    const canSync = useCallback(() => saveMode === "backend" && Boolean(token) && readyRef.current && !applyingRef.current, [saveMode, token]);

    const reportMissingLegacyMedia = useCallback((storageKey: string) => {
        if (missingLegacyStorageKeysRef.current.has(storageKey)) return;
        missingLegacyStorageKeysRef.current.add(storageKey);
        console.warn("[backend-sync] legacy media missing; keeping original reference", { storageKey });
    }, []);

    const syncConfigNow = useCallback(async () => {
        if (!canSync() || !token || pushingRef.current.config) return;
        const version = versionRef.current.config;
        if (lastPushedVersionRef.current.config === version) return;
        pushingRef.current.config = true;
        let succeeded = false;
        try {
            await pushBackendConfig(token, useConfigStore.getState().config);
            lastPushedVersionRef.current.config = versionRef.current.config;
            succeeded = true;
            handlePushSuccess("config");
        } catch (error) {
            handlePushFailure("config", error);
        } finally {
            pushingRef.current.config = false;
            if (succeeded && lastPushedVersionRef.current.config !== versionRef.current.config) void syncConfigNow();
        }
    }, [canSync, handlePushFailure, handlePushSuccess, token]);

    const syncProjectsNow = useCallback(async () => {
        if (!canSync() || !token || pushingRef.current.projects) return;
        const current = useCanvasStore.getState();
        if (lastPushedVersionRef.current.projects === versionRef.current.projects && !hasMigratableStorageKey(current.projects, missingLegacyStorageKeysRef.current)) return;
        pushingRef.current.projects = true;
        let succeeded = false;
        try {
            const migrated = (await migrateStorageKeysToBackend(current.projects, token, {
                uploads: new Map(),
                missingStorageKeys: missingLegacyStorageKeysRef.current,
                onMissing: reportMissingLegacyMedia,
            })) as CanvasProject[];
            if (migrated !== current.projects) {
                applyingRef.current = true;
                replaceProjects(migrated, current.projectTombstones);
                applyingRef.current = false;
            }
            const latest = useCanvasStore.getState();
            await pushBackendProjects(token, latest.projects, latest.projectTombstones);
            lastPushedVersionRef.current.projects = versionRef.current.projects;
            succeeded = true;
            handlePushSuccess("projects");
        } catch (error) {
            applyingRef.current = false;
            handlePushFailure("projects", error);
        } finally {
            pushingRef.current.projects = false;
            if (succeeded && lastPushedVersionRef.current.projects !== versionRef.current.projects) void syncProjectsNow();
        }
    }, [canSync, handlePushFailure, handlePushSuccess, replaceProjects, reportMissingLegacyMedia, token]);

    const syncAssetsNow = useCallback(async () => {
        if (!canSync() || !token || pushingRef.current.assets) return;
        const current = useAssetStore.getState().assets;
        if (lastPushedVersionRef.current.assets === versionRef.current.assets && !hasMigratableStorageKey(current, missingLegacyStorageKeysRef.current)) return;
        pushingRef.current.assets = true;
        let succeeded = false;
        try {
            const migrated = (await migrateStorageKeysToBackend(current, token, {
                uploads: new Map(),
                missingStorageKeys: missingLegacyStorageKeysRef.current,
                onMissing: reportMissingLegacyMedia,
            })) as Asset[];
            if (migrated !== current) {
                applyingRef.current = true;
                replaceAssets(migrated);
                applyingRef.current = false;
            }
            await pushBackendAssets(token, useAssetStore.getState().assets);
            lastPushedVersionRef.current.assets = versionRef.current.assets;
            succeeded = true;
            handlePushSuccess("assets");
        } catch (error) {
            applyingRef.current = false;
            handlePushFailure("assets", error);
        } finally {
            pushingRef.current.assets = false;
            if (succeeded && lastPushedVersionRef.current.assets !== versionRef.current.assets) void syncAssetsNow();
        }
    }, [canSync, handlePushFailure, handlePushSuccess, replaceAssets, reportMissingLegacyMedia, token]);

    useEffect(() => {
        if (!userHydrated) return;
        if (saveMode !== "backend") {
            clearBackendFileUrlCache();
            readyRef.current = false;
            bootstrappedUserRef.current = "";
            setWorkspaceState("idle");
            return;
        }
        if (!token) {
            clearBackendFileUrlCache();
            readyRef.current = false;
            bootstrappedUserRef.current = "";
            applyingRef.current = true;
            replaceProjects([], {});
            replaceAssets([]);
            replaceConfig(defaultConfig);
            applyingRef.current = false;
            setWorkspaceState("idle");
            return;
        }

        const bootstrapIdentity = (userId || "pending") + ":" + token;
        if (bootstrappedUserRef.current === bootstrapIdentity) return;
        let cancelled = false;
        let retryTimer: number | undefined;
        clearBackendFileUrlCache();
        readyRef.current = false;
        applyingRef.current = true;
        pushFailuresRef.current.clear();
        missingLegacyStorageKeysRef.current.clear();
        setWorkspaceState("loading");
        replaceProjects([], {});
        replaceAssets([]);
        replaceConfig(defaultConfig);

        void (async () => {
            const [currentUser, remote, runtime] = await Promise.all([
                fetchCurrentUser(token),
                fetchBackendBootstrap(token),
                fetchRuntimeConfig(),
            ]);
            if (cancelled) return;
            const identity = currentUser.id + ":" + token;

            const remoteConfig = parseRemoteConfig(remote.config?.data);
            const reconciled = reconcileConfigWithRuntime(
                remoteConfig || defaultConfig,
                runtime,
                useConfigStore.getState().comfyui,
            );
            const nextConfig = reconciled.config;
            const tombstones = remote.projectTombstones || {};
            const remoteProjects = remote.projects || [];
            const remoteAssets = remote.assets || [];
            invalidateImageModelCapabilities();
            invalidateVideoModelCapabilities();
            await signBackendFiles(token, collectBackendStorageKeys([remoteProjects, remoteAssets, nextConfig]));
            if (cancelled) return;

            useConfigStore.setState({
                config: nextConfig,
                comfyui: reconciled.comfyui,
            });
            replaceProjects(remoteProjects, tombstones);
            replaceAssets(remoteAssets);
            updateUser(currentUser);
            bootstrappedUserRef.current = identity;
            versionRef.current = { config: 0, projects: 0, assets: 0 };
            lastPushedVersionRef.current = { config: 0, projects: 0, assets: 0 };
            readyRef.current = true;
            applyingRef.current = false;
            bootstrapFailureNotifiedRef.current = false;
            setWorkspaceState("ready");
        })()
            .catch((error) => {
                if (cancelled) return;
                applyingRef.current = false;
                readyRef.current = false;
                if (isAuthError(error)) {
                    clearSession();
                    message.warning("登录已失效，请重新登录");
                    return;
                }
                const errorMessage = error instanceof Error ? error.message : "后端工作区加载失败";
                setWorkspaceState("error", errorMessage);
                console.error("[backend-sync] bootstrap failed", error);
                if (!bootstrapFailureNotifiedRef.current) {
                    bootstrapFailureNotifiedRef.current = true;
                    message.error(errorMessage);
                }
                retryTimer = window.setTimeout(() => setBootstrapRetryTick((value) => value + 1), BACKEND_BOOTSTRAP_RETRY_MS);
            });

        return () => {
            cancelled = true;
            if (retryTimer !== undefined) window.clearTimeout(retryTimer);
        };
    }, [bootstrapRetryTick, clearSession, message, replaceAssets, replaceConfig, replaceProjects, saveMode, setWorkspaceState, token, updateUser, userHydrated, userId]);

    useEffect(() => {
        if (!pushRetryTick || saveMode !== "backend" || !token || !readyRef.current || applyingRef.current) return;
        void syncConfigNow();
        void syncProjectsNow();
        void syncAssetsNow();
    }, [pushRetryTick, saveMode, syncAssetsNow, syncConfigNow, syncProjectsNow, token]);

    useEffect(
        () => () => {
            if (pushRetryTimerRef.current !== undefined) window.clearTimeout(pushRetryTimerRef.current);
        },
        [],
    );

    useEffect(() => {
        if (saveMode !== "backend" || !token) return;
        const unsubConfig = useConfigStore.subscribe((state, previous) => {
            if (state.config !== previous.config) versionRef.current.config++;
        });
        const unsubProjects = useCanvasStore.subscribe((state, previous) => {
            if (state.projects !== previous.projects || state.projectTombstones !== previous.projectTombstones) versionRef.current.projects++;
        });
        const unsubAssets = useAssetStore.subscribe((state, previous) => {
            if (state.assets !== previous.assets) versionRef.current.assets++;
        });
        return () => {
            unsubConfig();
            unsubProjects();
            unsubAssets();
        };
    }, [saveMode, token]);

    useEffect(() => {
        if (saveMode !== "backend" || !token || !readyRef.current || applyingRef.current) return;
        const timer = window.setTimeout(() => void syncConfigNow(), BACKEND_SYNC_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [config, saveMode, syncConfigNow, token]);

    useEffect(() => {
        if (saveMode !== "backend" || !token || !readyRef.current || applyingRef.current) return;
        const timer = window.setTimeout(() => void syncProjectsNow(), BACKEND_SYNC_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [projectTombstones, projects, saveMode, syncProjectsNow, token]);

    useEffect(() => {
        if (saveMode !== "backend" || !token || !readyRef.current || applyingRef.current) return;
        const timer = window.setTimeout(() => void syncAssetsNow(), BACKEND_SYNC_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [assets, saveMode, syncAssetsNow, token]);

    useEffect(() => {
        if (saveMode !== "backend" || !token) return;
        const flush = () => {
            void syncConfigNow();
            void syncProjectsNow();
            void syncAssetsNow();
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") flush();
        };
        document.addEventListener("visibilitychange", handleVisibilityChange);
        window.addEventListener("pagehide", flush);
        return () => {
            document.removeEventListener("visibilitychange", handleVisibilityChange);
            window.removeEventListener("pagehide", flush);
        };
    }, [saveMode, syncAssetsNow, syncConfigNow, syncProjectsNow, token]);
}

function parseRemoteConfig(value?: string): AiConfig | null {
    if (!value) return null;
    try {
        const parsed = JSON.parse(value) as AiConfig;
        if (!parsed || typeof parsed !== "object") throw new Error();
        return parsed;
    } catch {
        throw new Error("后端 AI 配置格式无效");
    }
}

function collectBackendStorageKeys(value: unknown, keys = new Set<string>(), seen = new WeakSet<object>()): Set<string> {
    if (typeof value === "string") {
        if (value.startsWith("backend:")) keys.add(value);
        return keys;
    }
    if (!value || typeof value !== "object" || seen.has(value)) return keys;
    seen.add(value);
    if (Array.isArray(value)) {
        value.forEach((item) => collectBackendStorageKeys(item, keys, seen));
        return keys;
    }
    Object.values(value as Record<string, unknown>).forEach((item) => collectBackendStorageKeys(item, keys, seen));
    return keys;
}

function hasMigratableStorageKey(value: unknown, ignoredStorageKeys: ReadonlySet<string>, seen = new WeakSet<object>()): boolean {
    if (!value || typeof value !== "object") return false;
    if (seen.has(value)) return false;
    seen.add(value);
    if (Array.isArray(value)) return value.some((item) => hasMigratableStorageKey(item, ignoredStorageKeys, seen));
    const source = value as Record<string, unknown>;
    if (
        typeof source.storageKey === "string"
        && source.storageKey
        && !source.storageKey.startsWith("backend:")
        && !ignoredStorageKeys.has(source.storageKey)
    ) return true;
    return Object.values(source).some((item) => hasMigratableStorageKey(item, ignoredStorageKeys, seen));
}

async function migrateStorageKeysToBackend(value: unknown, token: string, context: LegacyMigrationContext): Promise<unknown> {
    if (Array.isArray(value)) {
        const nextItems = await Promise.all(value.map((item) => migrateStorageKeysToBackend(item, token, context)));
        return nextItems.every((item, index) => item === value[index]) ? value : nextItems;
    }
    if (!value || typeof value !== "object") return value;
    const source = value as Record<string, unknown>;
    let record: Record<string, unknown> | null = null;
    const setRecordValue = (key: string, nextValue: unknown) => {
        if (source[key] === nextValue) return;
        if (!record) record = { ...source };
        record[key] = nextValue;
    };
    const storageKey = typeof source.storageKey === "string" ? source.storageKey : "";
    if (storageKey && !storageKey.startsWith("backend:") && !context.missingStorageKeys.has(storageKey)) {
        let pendingUpload = context.uploads.get(storageKey);
        if (!pendingUpload) {
            pendingUpload = uploadLegacyMedia(storageKey, source, token);
            context.uploads.set(storageKey, pendingUpload);
        }
        try {
            const uploaded = await pendingUpload;
            const url = uploaded.url;
            setRecordValue("storageKey", uploaded.storageKey);
            setRecordValue("bytes", uploaded.bytes);
            setRecordValue("mimeType", uploaded.mimeType);
            if (typeof source.content === "string") setRecordValue("content", url);
            if (typeof source.dataUrl === "string") setRecordValue("dataUrl", url);
            if (typeof source.url === "string") setRecordValue("url", url);
            if (typeof source.coverUrl === "string") setRecordValue("coverUrl", url);
        } catch (error) {
            if (!(error instanceof LegacyMediaMissingError)) throw error;
            context.onMissing(error.storageKey);
        }
    }
    for (const key of Object.keys(source)) {
        if (key === "storageKey") continue;
        const nextValue = await migrateStorageKeysToBackend(source[key], token, context);
        setRecordValue(key, nextValue);
    }
    return record || value;
}

async function uploadLegacyMedia(storageKey: string, source: Record<string, unknown>, token: string) {
    const isImage = storageKey.startsWith("image:") || String(source.mimeType || "").startsWith("image/");
    let blob = isImage ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
    if (!blob) blob = await fetchReferencedBlob(source);
    if (!blob) throw new LegacyMediaMissingError(storageKey);
    return uploadBackendFile(token, blob, storageKey.replace(/[:/\\]/g, "_") || "file");
}

async function fetchReferencedBlob(source: Record<string, unknown>) {
    const candidates = [source.dataUrl, source.content, source.url, source.coverUrl];
    for (const candidate of candidates) {
        if (typeof candidate !== "string" || !candidate || candidate.startsWith("blob:")) continue;
        try {
            const response = await fetch(candidate);
            if (response.ok) return response.blob();
        } catch {
            // Continue to the next stored reference before declaring migration failure.
        }
    }
    return null;
}

function isAuthError(error: unknown) {
    return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function timeOf(value: unknown) {
    if (typeof value === "number") return value;
    if (typeof value === "string") return Date.parse(value) || 0;
    return 0;
}
