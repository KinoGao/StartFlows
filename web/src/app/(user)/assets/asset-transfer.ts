import { saveAs } from "file-saver";

import { createZip, readZip } from "@/lib/zip";
import { getMediaBlob, uploadMediaFile } from "@/services/file-storage";
import { getImageBlob, uploadImage } from "@/services/image-storage";
import { APP_EXPORT_ID } from "@/lib/storage-keys";
import { exportFileExtension, safeExportFileName } from "@/lib/export-file";
import type { Asset } from "@/stores/use-asset-store";

type AssetExportFile = {
    app: typeof APP_EXPORT_ID;
    version: 1;
    exportedAt: string;
    assets: Asset[];
    files: AssetExportItem[];
};

type AssetExportItem = {
    storageKey: string;
    path: string;
    mimeType: string;
    bytes: number;
};

export async function exportAssets(assets: Asset[]) {
    const files: AssetExportItem[] = [];
    const zipFiles: { name: string; data: BlobPart }[] = [];

    await Promise.all(
        assets.map(async (asset) => {
            if (asset.kind !== "image" && asset.kind !== "video" && asset.kind !== "audio") return;
            const storageKey = asset.data.storageKey;
            if (!storageKey) return;
            const fallback = asset.data.serverUrl || (asset.kind === "image" ? asset.data.dataUrl : asset.data.url);
            const blob = asset.kind === "image" ? await getImageBlob(storageKey, fallback) : await getMediaBlob(storageKey, fallback);
            if (!blob) return;
            const path = `files/${safeExportFileName(storageKey)}.${exportFileExtension(blob.type, asset.kind)}`;
            files.push({ storageKey, path, mimeType: blob.type || asset.data.mimeType, bytes: blob.size });
            zipFiles.push({ name: path, data: blob });
        }),
    );

    const data: AssetExportFile = { app: APP_EXPORT_ID, version: 1, exportedAt: new Date().toISOString(), assets, files };
    const zip = await createZip([{ name: "assets.json", data: JSON.stringify(data, null, 2) }, ...zipFiles]);
    saveAs(zip, "我的素材.zip");
}

export async function readAssetPackage(file: File): Promise<Asset[]> {
    const zip = await readZip(file);
    const assetFile = zip.get("assets.json");
    if (!assetFile) throw new Error("missing assets.json");
    const data = JSON.parse(await assetFile.text()) as AssetExportFile;
    if (data.app !== APP_EXPORT_ID) throw new Error("不是当前应用的素材包");
    const uploaded = new Map<string, Awaited<ReturnType<typeof uploadImage>> | Awaited<ReturnType<typeof uploadMediaFile>>>();
    await Promise.all(
        data.files.map(async (item) => {
            const blob = zip.get(item.path);
            if (!blob) return;
            const typedBlob = blob.type ? blob : blob.slice(0, blob.size, item.mimeType);
            const media = item.mimeType.startsWith("image/") ? await uploadImage(typedBlob) : await uploadMediaFile(typedBlob, item.mimeType.startsWith("audio/") ? "audio" : "video");
            uploaded.set(item.storageKey, media);
        }),
    );
    const assets: Asset[] = [];
    data.assets.forEach((asset) => {
        if (asset.kind === "text") {
            assets.push({ ...asset, coverUrl: stableCover(asset.coverUrl) });
            return;
        }
        const media = asset.data.storageKey ? uploaded.get(asset.data.storageKey) : undefined;
        if (!media) return;
        if (asset.kind === "image") {
            assets.push({
                ...asset,
                coverUrl: media.url,
                data: {
                    ...asset.data,
                    dataUrl: media.url,
                    serverUrl: media.url,
                    remoteUrl: undefined,
                    storageKey: media.storageKey,
                    width: media.width || asset.data.width,
                    height: media.height || asset.data.height,
                    bytes: media.bytes,
                    mimeType: media.mimeType,
                },
            });
            return;
        }
        if (asset.kind === "audio") {
            assets.push({
                ...asset,
                coverUrl: stableCover(asset.coverUrl),
                data: {
                    ...asset.data,
                    url: media.url,
                    serverUrl: media.url,
                    remoteUrl: undefined,
                    storageKey: media.storageKey,
                    durationMs: ("durationMs" in media ? media.durationMs : undefined) || asset.data.durationMs,
                    bytes: media.bytes,
                    mimeType: media.mimeType,
                },
            });
            return;
        }
        assets.push({
            ...asset,
            coverUrl: stableCover(asset.coverUrl),
            data: { ...asset.data, url: media.url, serverUrl: media.url, remoteUrl: undefined, storageKey: media.storageKey, width: media.width || asset.data.width, height: media.height || asset.data.height, bytes: media.bytes, mimeType: media.mimeType },
        });
    });
    return assets;
}

function stableCover(value: string) {
    return value && !value.startsWith("data:") && !value.startsWith("blob:") ? value : "";
}
