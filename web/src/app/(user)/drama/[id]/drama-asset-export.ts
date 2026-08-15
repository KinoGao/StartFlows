import { saveAs } from "file-saver";

import type { DramaAssetReference, DramaNamedAsset, DramaProject } from "@/lib/drama-project-contract";
import { exportFileExtension, safeExportFileName } from "@/lib/export-file";
import { originalImageDownloadUrl } from "@/lib/media-image-url";
import { mediaDownloadFileName } from "@/lib/media-file";
import { createZip } from "@/lib/zip";
import type { DramaAssetKind } from "./drama-asset-definitions";
import { dramaAssetReferences } from "./drama-asset-reference-utils";

const ASSET_KIND_LABELS: Record<DramaAssetKind, string> = { characters: "角色", scenes: "场景", props: "道具", clues: "线索" };

type ExportEntry = {
    kind: DramaAssetKind;
    asset: DramaNamedAsset;
    reference?: DramaAssetReference;
};

export type DramaAssetExportResult = {
    exported: number;
    skipped: number;
    total: number;
};

export async function downloadDramaAssetBundle(project: DramaProject): Promise<DramaAssetExportResult> {
    const entries = (Object.keys(ASSET_KIND_LABELS) as DramaAssetKind[]).flatMap((kind) => project[kind].map((asset) => ({ kind, asset, reference: primaryReference(asset) })));
    const files: Array<{ name: string; data: Blob }> = [];
    const manifest: Array<{ kind: string; name: string; id: string; referenceUrl?: string; status: "exported" | "missing" | "failed" }> = [];

    await Promise.all(
        entries.map(async ({ kind, asset, reference }) => {
            if (!reference?.url) {
                manifest.push({ kind: ASSET_KIND_LABELS[kind], name: asset.name, id: asset.id, status: "missing" });
                return;
            }
            try {
                const response = await fetch(originalImageDownloadUrl(reference.url));
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const blob = await response.blob();
                const extension = exportFileExtension(blob.type, "image");
                files.push({ name: `${ASSET_KIND_LABELS[kind]}/${safeExportFileName(asset.name)}-${asset.id}.${extension}`, data: blob });
                manifest.push({ kind: ASSET_KIND_LABELS[kind], name: asset.name, id: asset.id, referenceUrl: reference.url, status: "exported" });
            } catch {
                manifest.push({ kind: ASSET_KIND_LABELS[kind], name: asset.name, id: asset.id, referenceUrl: reference.url, status: "failed" });
            }
        }),
    );

    if (files.length) {
        const zip = await createZip([{ name: "asset-manifest.json", data: JSON.stringify({ projectId: project.id, projectTitle: project.title, exportedAt: new Date().toISOString(), assets: manifest }, null, 2) }, ...files]);
        saveAs(zip, mediaDownloadFileName(`${project.id}:drama-assets`, "application/zip"));
    }

    return {
        exported: files.length,
        skipped: manifest.length - files.length,
        total: entries.length,
    };
}

function primaryReference(asset: DramaNamedAsset) {
    const references = dramaAssetReferences(asset);
    return references.find((reference) => reference.id === asset.primaryReferenceId) || references[0];
}
