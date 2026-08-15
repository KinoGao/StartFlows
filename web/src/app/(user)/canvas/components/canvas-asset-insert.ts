import type { Asset } from "@/lib/library-asset-contract";

export type InsertAssetPayload =
    | { kind: "text"; content: string; title: string }
    | { kind: "image"; dataUrl: string; title: string; storageKey?: string; remoteUrl?: string; serverUrl?: string }
    | { kind: "video"; url: string; title: string; storageKey?: string; remoteUrl?: string; serverUrl?: string; width?: number; height?: number }
    | { kind: "audio"; url: string; title: string; storageKey?: string; remoteUrl?: string; serverUrl?: string; durationMs?: number };

export function libraryAssetToInsertPayload(asset: Asset): InsertAssetPayload {
    if (asset.kind === "text") return { kind: "text", content: asset.data.content, title: asset.title };
    if (asset.kind === "video") {
        return {
            kind: "video",
            url: asset.data.url,
            storageKey: asset.data.storageKey,
            remoteUrl: asset.data.remoteUrl,
            serverUrl: asset.data.serverUrl,
            title: asset.title,
            width: asset.data.width,
            height: asset.data.height,
        };
    }
    if (asset.kind === "audio") {
        return {
            kind: "audio",
            url: asset.data.url,
            storageKey: asset.data.storageKey,
            remoteUrl: asset.data.remoteUrl,
            serverUrl: asset.data.serverUrl,
            title: asset.title,
            durationMs: asset.data.durationMs,
        };
    }
    return {
        kind: "image",
        dataUrl: asset.data.dataUrl,
        storageKey: asset.data.storageKey,
        remoteUrl: asset.data.remoteUrl,
        serverUrl: asset.data.serverUrl,
        title: asset.title,
    };
}
