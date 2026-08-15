"use client";

import { nanoid } from "nanoid";
import { create } from "zustand";

import { cleanupUnusedMedia } from "@/flowcanvas/services/file-storage";
import { cleanupUnusedImages } from "@/flowcanvas/services/image-storage";

export type AssetKind = "text" | "image" | "video" | "audio";
export type TextAsset = AssetBase<"text"> & { data: { content: string } };
export type ImageAsset = AssetBase<"image"> & { data: { dataUrl: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type VideoAsset = AssetBase<"video"> & { data: { url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string } };
export type AudioAsset = AssetBase<"audio"> & { data: { url: string; storageKey?: string; bytes: number; mimeType: string; durationMs?: number } };
export type Asset = TextAsset | ImageAsset | VideoAsset | AudioAsset;

type AssetBase<T extends AssetKind> = {
    id: string;
    kind: T;
    title: string;
    coverUrl: string;
    tags: string[];
    source?: string;
    note?: string;
    createdAt: string;
    updatedAt: string;
    metadata?: Record<string, unknown>;
};

type AssetStore = {
    hydrated: boolean;
    assets: Asset[];
    addAsset: (asset: Omit<Asset, "id" | "createdAt" | "updatedAt">) => string;
    updateAsset: (id: string, patch: Partial<Omit<Asset, "id" | "createdAt">>) => void;
    removeAsset: (id: string) => void;
    replaceAssets: (assets: Asset[]) => void;
    cleanupImages: (extra?: unknown) => void;
};

export const useAssetStore = create<AssetStore>()((set, get) => ({
    hydrated: true,
    assets: [],
    addAsset: (asset) => {
        const now = new Date().toISOString();
        const id = nanoid();
        set((state) => ({ assets: [{ ...asset, id, createdAt: now, updatedAt: now } as Asset, ...state.assets] }));
        return id;
    },
    updateAsset: (id, patch) =>
        set((state) => ({
            assets: state.assets.map((asset) => (asset.id === id ? ({ ...asset, ...patch, updatedAt: new Date().toISOString() } as Asset) : asset)),
        })),
    removeAsset: (id) =>
        set((state) => {
            const assets = state.assets.filter((asset) => asset.id !== id);
            get().cleanupImages({ assets });
            return { assets };
        }),
    replaceAssets: (assets) => set({ assets }),
    cleanupImages: (extra) => {
        window.setTimeout(async () => {
            const { useCanvasStore } = await import("@/flowcanvas/canvas/stores/use-canvas-store");
            await cleanupUnusedImages({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
            await cleanupUnusedMedia({ assets: get().assets, projects: useCanvasStore.getState().projects, extra });
        }, 0);
    },
}));
