import type { ImageAsset, VideoAsset } from "@/stores/use-asset-store";
import type { ReferenceImage } from "@/types/image";
import type { ReferenceVideo } from "@/types/media";

type StoredImage = { url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string };
type StoredVideo = { url: string; storageKey?: string; width: number; height: number; bytes: number; mimeType: string };
type RemoteSource = { remoteUrl?: string; serverUrl?: string };
type PickedImage = RemoteSource & { title: string; dataUrl: string; storageKey?: string };
type PickedVideo = RemoteSource & { title: string; url: string; storageKey?: string; width?: number; height?: number };

export function imageAssetData(stored: StoredImage, source: RemoteSource): ImageAsset["data"] {
    return { dataUrl: stored.url, storageKey: stored.storageKey, remoteUrl: clean(source.remoteUrl), serverUrl: clean(source.serverUrl), width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType };
}

export function videoAssetData(stored: StoredVideo, source: RemoteSource): VideoAsset["data"] {
    return { url: stored.url, storageKey: stored.storageKey, remoteUrl: clean(source.remoteUrl), serverUrl: clean(source.serverUrl), width: stored.width, height: stored.height, bytes: stored.bytes, mimeType: stored.mimeType };
}

export function referenceImageFromAsset(payload: PickedImage, stored: StoredImage, id: string): ReferenceImage {
    const remoteUrl = clean(payload.remoteUrl);
    const serverUrl = clean(payload.serverUrl);
    return { id, name: payload.title, type: stored.mimeType, dataUrl: stored.url, storageKey: stored.storageKey, url: serverUrl || remoteUrl, remoteUrl, serverUrl, width: stored.width, height: stored.height };
}

export function referenceVideoFromAsset(payload: PickedVideo, id: string): ReferenceVideo {
    return { id, name: payload.title, type: "video/mp4", url: clean(payload.remoteUrl) || clean(payload.serverUrl) || payload.url, storageKey: payload.storageKey, width: payload.width, height: payload.height };
}

function clean(value?: string) {
    return value?.trim() || undefined;
}
