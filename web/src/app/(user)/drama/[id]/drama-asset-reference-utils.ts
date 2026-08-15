import { nanoid } from "nanoid";

import type { DramaAssetReference, DramaNamedAsset } from "@/lib/drama-project-contract";
import type { ImageGenerationResult } from "@/services/api/image";
import { stableTaskUrl } from "./drama-editor-elements";

export function dramaAssetReferences(item: DramaNamedAsset): DramaAssetReference[] {
    if (item.references?.length) return item.references;
    return item.referenceImageUrl
        ? [
              {
                  id: `${item.id}-reference-legacy`,
                  url: item.referenceImageUrl,
                  storageKey: item.referenceStorageKey,
                  source: "library",
                  label: "原参考图",
                  createdAt: new Date(0).toISOString(),
              },
          ]
        : [];
}

export function imageResultsToReferences(result: ImageGenerationResult & { results?: ImageGenerationResult[] }): DramaAssetReference[] {
    const images = result.results?.length ? result.results : [result];
    const createdAt = new Date().toISOString();
    return images.flatMap((image, index) => {
        const url = stableTaskUrl(image.remoteUrl, image.serverUrl, image.dataUrl);
        return url
            ? [
                  {
                      id: `reference-${nanoid()}`,
                      url,
                      source: "generated" as const,
                      label: images.length > 1 ? `AI 候选图 ${index + 1}` : "AI 候选图",
                      width: image.width,
                      height: image.height,
                      createdAt,
                  },
              ]
            : [];
    });
}
