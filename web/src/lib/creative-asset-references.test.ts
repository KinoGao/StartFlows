import { describe, expect, it } from "vitest";

import type { CreativeAsset } from "@/lib/creative-runtime-contract";

import { creativeAssetReferenceAliases, orderCreativeAssetsByIds } from "./creative-asset-references";

describe("creative asset references", () => {
    it("assigns stable type-specific aliases in the user's reference order", () => {
        const assets = [asset("image-a", "image"), asset("video-a", "video"), asset("image-b", "image")];

        expect(Array.from(creativeAssetReferenceAliases(assets, ["image-b", "video-a", "image-a"]))).toEqual([
            ["image-b", "图片1"],
            ["video-a", "视频1"],
            ["image-a", "图片2"],
        ]);
    });

    it("restores request order without dropping unlisted assets", () => {
        const assets = [asset("image-a", "image"), asset("image-b", "image"), asset("image-c", "image")];

        expect(orderCreativeAssetsByIds(assets, ["image-c", "image-a"]).map((item) => item.id)).toEqual(["image-c", "image-a", "image-b"]);
    });
});

function asset(id: string, type: CreativeAsset["type"]): CreativeAsset {
    return {
        id,
        userId: "user",
        conversationId: "conversation",
        ordinal: 0,
        type,
        status: "ready",
        title: id,
        metadata: {},
        createdAt: 1,
        updatedAt: 1,
    };
}
