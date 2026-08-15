import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CreativeAsset } from "@/lib/creative-runtime-contract";

import { ConversationAssets, PromptList } from "./creative-assets-panel";

const imageAsset: CreativeAsset = {
    id: "asset-one",
    userId: "user-one",
    conversationId: "conversation-one",
    ordinal: 0,
    type: "image",
    status: "ready",
    title: "参考图",
    serverUrl: "/api/reference-assets/asset-one",
    metadata: {},
    createdAt: 1,
    updatedAt: 1,
};

const videoAsset: CreativeAsset = {
    ...imageAsset,
    id: "asset-video",
    ordinal: 1,
    type: "video",
    title: "参考视频",
    serverUrl: "/api/reference-assets/asset-video",
    metadata: { coverUrl: "/api/reference-assets/asset-video-cover" },
};

describe("CreativeAssetsPanel", () => {
    it("renders prompt collections as cover thumbnails with only an insert command", () => {
        const markup = renderToStaticMarkup(
            <PromptList
                collection={{
                    items: [
                        {
                            id: "prompt-one",
                            title: "封面标题",
                            coverUrl: "/api/public/prompt-images?path=cover.jpg",
                            prompt: "提示词正文应该隐藏",
                            tags: [],
                            category: "图片",
                            preview: "",
                            createdAt: "2026-08-11T00:00:00.000Z",
                            updatedAt: "2026-08-11T00:00:00.000Z",
                        },
                    ],
                    page: 1,
                    total: 1,
                    loading: false,
                    loaded: true,
                    error: "",
                    categories: ["图片"],
                }}
                activeCategory="UI 与社交媒体"
                keyword=""
                onSearch={() => undefined}
                onCategoryChange={() => undefined}
                onPreview={() => undefined}
                onUse={() => undefined}
                onRetry={() => undefined}
                onLoadMore={() => undefined}
            />,
        );

        expect(markup).toContain('data-testid="creative-prompt-thumbnails"');
        expect(markup).toContain('data-testid="creative-prompt-scroll"');
        expect(markup).toContain("grid-cols-4");
        expect(markup).toContain('aria-label="搜索提示词"');
        expect(markup).toContain('placeholder="搜索提示词"');
        expect(markup).toContain("提示词分类");
        expect(markup).toContain('aria-label="提示词分类"');
        expect(markup).toContain("UI 与社交");
        expect(markup).not.toContain("UI 与社交媒体");
        expect(markup).toContain('data-testid="creative-prompt-insert-action"');
        expect(markup).toContain("插入</button>");
        expect(markup).not.toContain(">插入提示词</button>");
        const insertActionClass = markup.match(/data-testid="creative-prompt-insert-action" class="([^"]+)"/)?.[1] || "";
        expect(insertActionClass).toContain("gap-1");
        expect(insertActionClass).toContain("!bg-transparent");
        expect(insertActionClass).toContain("!text-[11px]");
        expect(markup).toContain("format=webp");
        expect(markup).toContain("展开查看封面标题");
        expect(markup).not.toContain("提示词正文应该隐藏");
        expect(markup).not.toContain(">封面标题<");
    });

    it("uses a compact reference command and theme border without a check badge", () => {
        const markup = renderToStaticMarkup(<ConversationAssets conversationId="conversation-one" assets={[imageAsset, videoAsset]} selectedAssetIds={[imageAsset.id]} onToggle={() => undefined} onPreview={() => undefined} />);

        expect(markup).toContain('data-testid="creative-conversation-assets"');
        expect(markup).toContain('aria-label="当前对话资产类型"');
        expect(markup).toContain('data-testid="creative-conversation-image-assets"');
        expect(markup).not.toContain('data-testid="creative-conversation-video-assets"');
        expect(markup).toContain("图片");
        expect(markup).toContain("视频");
        expect(markup).toContain("grid-cols-4");
        expect(markup).toContain("border-[#6268d8]");
        expect(markup).toContain('data-testid="creative-asset-reference-action"');
        expect(markup).toContain('aria-label="取消引用参考图"');
        expect(markup).toContain("已引用</button>");
        const referenceActionClass = markup.match(/data-testid="creative-asset-reference-action" class="([^"]+)"/)?.[1] || "";
        expect(referenceActionClass).toContain("gap-1");
        expect(referenceActionClass).toContain("!bg-transparent");
        expect(referenceActionClass).toContain("!text-[11px]");
        expect(markup).not.toContain("勾选");
    });
});
