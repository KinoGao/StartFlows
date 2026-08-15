import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CreativeAsset } from "@/lib/creative-runtime-contract";

import { CreativeAssetMentionPicker } from "./creative-asset-mention-picker";

describe("CreativeAssetMentionPicker", () => {
    it("separates images and videos while preserving the source order inside each grid", () => {
        const markup = renderToStaticMarkup(<CreativeAssetMentionPicker assets={[asset("image-one", "image", 1), asset("video-one", "video", 2), asset("image-two", "image", 3)]} selectedAssetIds={["image-two"]} onSelect={() => undefined} />);

        expect(markup).toContain('data-testid="creative-asset-mention-image-grid"');
        expect(markup).not.toContain('data-testid="creative-asset-mention-video-grid"');
        expect(markup).toContain('aria-label="引用素材类型"');
        expect(markup).toContain("图片");
        expect(markup).toContain("视频");
        expect(markup).toContain("grid-cols-2");
        expect(markup).toContain("text-primary");
        expect(markup).not.toContain("border-b");
        expect(markup).not.toContain("bg-[#eeeeff]");
        expect(markup.indexOf('data-asset-id="image-one"')).toBeLessThan(markup.indexOf('data-asset-id="image-two"'));
        expect(markup).not.toContain(">图片素材 1<");
        expect(markup).not.toContain(">图片素材 2<");
    });

    it("omits redundant category chrome when only one media type is available", () => {
        const markup = renderToStaticMarkup(<CreativeAssetMentionPicker assets={[asset("image-one", "image", 1), asset("image-two", "image", 2)]} selectedAssetIds={[]} onSelect={() => undefined} />);

        expect(markup).toContain('data-testid="creative-asset-mention-image-grid"');
        expect(markup).not.toContain('aria-label="引用素材类型"');
        expect(markup).not.toContain('role="tablist"');
    });

    it("keeps every item in a scrollable category without truncating large result sets", () => {
        const videos = Array.from({ length: 36 }, (_, index) => asset(`video-${index}`, "video", index + 1));
        const markup = renderToStaticMarkup(<CreativeAssetMentionPicker assets={videos} selectedAssetIds={[]} onSelect={() => undefined} />);

        expect(markup.match(/data-asset-id=/g)).toHaveLength(videos.length);
        expect(markup).toContain("max-h-[min(16rem,calc(100dvh-10rem))]");
        expect(markup).toContain("overflow-y-auto");
        expect(markup).not.toContain('aria-label="引用素材类型"');
    });

    it("uses the real video source as the thumbnail when no cover image exists", () => {
        const video = { ...asset("video-no-cover", "video", 1), metadata: {} };
        const markup = renderToStaticMarkup(<CreativeAssetMentionPicker assets={[video]} selectedAssetIds={[]} onSelect={() => undefined} />);

        expect(markup).toContain("<video");
        expect(markup).toContain('src="/media/video-no-cover.mp4"');
        expect(markup).toContain('preload="metadata"');
        expect(markup).toContain('aria-hidden="true"');
    });
});

function asset(id: string, type: "image" | "video", ordinal: number): CreativeAsset {
    return {
        id,
        userId: "user",
        conversationId: "conversation",
        ordinal,
        type,
        status: "ready",
        title: `${type === "image" ? "图片" : "视频"}素材 ${ordinal}`,
        serverUrl: `/media/${id}.${type === "video" ? "mp4" : "webp"}`,
        metadata: type === "video" ? { coverUrl: `/media/${id}-cover.webp` } : {},
        createdAt: ordinal,
        updatedAt: ordinal,
    };
}
