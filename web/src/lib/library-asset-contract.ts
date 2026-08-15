export type AssetKind = "text" | "image" | "video" | "audio";

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

export type TextAsset = AssetBase<"text"> & { data: { content: string } };
export type ImageAsset = AssetBase<"image"> & { data: { dataUrl: string; storageKey?: string; remoteUrl?: string; serverUrl?: string; width: number; height: number; bytes: number; mimeType: string } };
export type VideoAsset = AssetBase<"video"> & { data: { url: string; storageKey?: string; remoteUrl?: string; serverUrl?: string; width: number; height: number; bytes: number; mimeType: string } };
export type AudioAsset = AssetBase<"audio"> & { data: { url: string; storageKey?: string; remoteUrl?: string; serverUrl?: string; durationMs?: number; bytes: number; mimeType: string } };
export type Asset = TextAsset | ImageAsset | VideoAsset | AudioAsset;
type WithoutIdentity<T> = T extends Asset ? Omit<T, "id" | "createdAt" | "updatedAt"> : never;
export type CreateLibraryAssetInput = WithoutIdentity<Asset>;
