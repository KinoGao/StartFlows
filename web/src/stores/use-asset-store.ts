"use client";

import { create } from "zustand";

import { createClientSessionEpoch, type ClientSessionStamp } from "@/lib/client-session-epoch";
import type { Asset, CreateLibraryAssetInput } from "@/lib/library-asset-contract";
import { createLibraryAsset, deleteLibraryAsset, listLibraryAssets, saveLibraryAsset } from "@/services/api/library-assets";
import { uploadMediaFile } from "@/services/file-storage";
import { uploadImage } from "@/services/image-storage";
import { isPermanentServerMedia, serverMediaUrl } from "@/services/server-media-storage";
import { useUserStore } from "@/stores/use-user-store";

export type { Asset, AssetKind, AudioAsset, ImageAsset, VideoAsset } from "@/lib/library-asset-contract";

type AssetStore = {
    hydrated: boolean;
    hydratedUserId: string;
    syncError?: string;
    assets: Asset[];
    hydrate: (force?: boolean) => Promise<void>;
    addAsset: (asset: CreateLibraryAssetInput) => Promise<string>;
    updateAsset: (id: string, asset: CreateLibraryAssetInput) => Promise<void>;
    removeAsset: (id: string) => Promise<void>;
    reset: () => void;
};

const sessionEpoch = createClientSessionEpoch(() => useUserStore.getState().user?.id || "");
let hydrateRequestId = 0;
let hydrateRequest: (ClientSessionStamp & { requestId: number; promise: Promise<void> }) | null = null;

export const useAssetStore = create<AssetStore>((set, get) => ({
    hydrated: false,
    hydratedUserId: "",
    assets: [],
    hydrate: async (force = false) => {
        const userId = useUserStore.getState().user?.id || "";
        if (!userId) {
            sessionEpoch.invalidate();
            hydrateRequest = null;
            set({ hydrated: true, hydratedUserId: "", assets: [], syncError: undefined });
            return;
        }
        if (!force && get().hydrated && get().hydratedUserId === userId) return;
        const session = sessionEpoch.capture();
        if (!force && hydrateRequest?.userId === session.userId && hydrateRequest.epoch === session.epoch) return hydrateRequest.promise;
        const requestId = ++hydrateRequestId;
        set((state) => ({ hydrated: false, hydratedUserId: userId, assets: state.hydratedUserId === userId ? state.assets : [], syncError: undefined }));
        const promise = listLibraryAssets()
            .then((assets) => {
                if (!isActiveHydrate(session, requestId)) return;
                set({ assets, hydrated: true, hydratedUserId: userId });
            })
            .catch((error) => {
                if (isActiveHydrate(session, requestId)) set({ assets: [], hydrated: false, hydratedUserId: userId, syncError: error instanceof Error ? error.message : "素材加载失败" });
            })
            .finally(() => {
                if (hydrateRequest?.requestId === requestId) hydrateRequest = null;
            });
        hydrateRequest = { ...session, requestId, promise };
        return promise;
    },
    addAsset: async (input) => {
        const session = requireSession();
        const prepared = await prepareAssetForServer(input);
        if (!sessionEpoch.isCurrent(session)) throw new Error("登录会话已变更，请重试");
        const asset = await createLibraryAsset(prepared);
        if (sessionEpoch.isCurrent(session)) set((state) => ({ assets: [asset, ...state.assets.filter((item) => item.id !== asset.id)], syncError: undefined }));
        return asset.id;
    },
    updateAsset: async (id, input) => {
        const session = requireSession();
        const prepared = await prepareAssetForServer(input);
        if (!sessionEpoch.isCurrent(session)) throw new Error("登录会话已变更，请重试");
        const asset = await saveLibraryAsset(id, prepared);
        if (sessionEpoch.isCurrent(session)) set((state) => ({ assets: state.assets.map((item) => (item.id === id ? asset : item)), syncError: undefined }));
    },
    removeAsset: async (id) => {
        const session = requireSession();
        await deleteLibraryAsset(id);
        if (sessionEpoch.isCurrent(session)) set((state) => ({ assets: state.assets.filter((asset) => asset.id !== id), syncError: undefined }));
    },
    reset: () => {
        sessionEpoch.invalidate();
        hydrateRequest = null;
        set({ hydrated: false, hydratedUserId: "", assets: [], syncError: undefined });
    },
}));

function isActiveHydrate(session: ClientSessionStamp, requestId: number) {
    return sessionEpoch.isCurrent(session) && hydrateRequest?.requestId === requestId;
}

function requireSession() {
    const session = sessionEpoch.capture();
    if (!session.userId) throw new Error("请先登录");
    return session;
}

async function prepareAssetForServer(input: CreateLibraryAssetInput): Promise<CreateLibraryAssetInput> {
    if (input.kind === "image") {
        const source = input.data.serverUrl || input.data.dataUrl || input.data.remoteUrl || "";
        if (isPermanentServerMedia(input.data.storageKey, input.data.serverUrl)) return { ...input, coverUrl: await storeCover(input.coverUrl || input.data.serverUrl || input.data.dataUrl) };
        const image = await uploadImage(source);
        return { ...input, coverUrl: await storeCover(input.coverUrl || image.url), data: { dataUrl: image.url, storageKey: image.storageKey, serverUrl: image.url, width: image.width, height: image.height, bytes: image.bytes, mimeType: image.mimeType } };
    }
    if (input.kind === "video" || input.kind === "audio") {
        const source = input.data.serverUrl || input.data.url || input.data.remoteUrl || "";
        if (isPermanentServerMedia(input.data.storageKey, input.data.serverUrl)) return { ...input, coverUrl: await storeCover(input.coverUrl) };
        const media = await uploadMediaFile(source, input.kind);
        if (input.kind === "audio")
            return { ...input, coverUrl: await storeCover(input.coverUrl), data: { url: media.url, storageKey: media.storageKey, serverUrl: media.url, durationMs: media.durationMs || input.data.durationMs, bytes: media.bytes, mimeType: media.mimeType } };
        return {
            ...input,
            coverUrl: await storeCover(input.coverUrl),
            data: { url: media.url, storageKey: media.storageKey, serverUrl: media.url, width: media.width || input.data.width, height: media.height || input.data.height, bytes: media.bytes, mimeType: media.mimeType },
        };
    }
    return { ...input, coverUrl: await storeCover(input.coverUrl) };
}

async function storeCover(value: string) {
    if (!value || isPermanentServerMedia(undefined, value)) return serverMediaUrl(undefined, value);
    return (await uploadImage(value)).url;
}
