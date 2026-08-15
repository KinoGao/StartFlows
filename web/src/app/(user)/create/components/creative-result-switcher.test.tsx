import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CreativeAsset } from "@/lib/creative-runtime-contract";

import { CreativeResultSwitcher, hasMultipleCreativeResults } from "./creative-result-switcher";

describe("creative result switcher", () => {
    it("does not render any more-results DOM for one actual result", () => {
        const results = [asset("one")];
        expect(hasMultipleCreativeResults([])).toBe(false);
        expect(hasMultipleCreativeResults(results)).toBe(false);
        expect(renderToStaticMarkup(<CreativeResultSwitcher results={results} selectedIndex={0} width={352} height={320} renderThumbnail={() => <span>预览</span>} onSelect={() => undefined} />)).toBe("");
    });

    it("renders the shared switcher only for multiple actual results", () => {
        const results = [asset("one"), asset("two")];
        const markup = renderToStaticMarkup(<CreativeResultSwitcher results={results} selectedIndex={1} width={352} height={320} renderThumbnail={(_result, index) => <span>预览 {index + 1}</span>} onSelect={() => undefined} />);
        expect(hasMultipleCreativeResults(results)).toBe(true);
        expect(markup).toContain(">更多</span>");
        expect(markup).toContain('data-results-count="2"');
        expect(markup).toContain('data-testid="creative-result-position"');
        expect(markup).toContain("2 / 2");
        expect(markup).toContain('aria-label="查看生成结果 2"');
        expect(markup).toContain('aria-pressed="true"');
        expect(markup).toContain("data-selected-outline");
        expect(markup).toContain("data-thumbnail-content");
        expect(markup).toContain("inset-[2px]");
        expect(markup).toContain("rounded-[6px]");
        expect(markup).toContain("sm:flex-col");
        expect(markup).toContain("sm:overflow-y-auto");
        expect(markup).toContain("sm:h-12");
        expect(markup).toContain("border-primary");
        expect(markup).toContain("focus-visible:ring-primary/30");
        expect(markup).not.toContain("lucide-check");
        expect(markup).not.toContain("border-[#615cff]");
    });

    it("keeps every result in the shared switcher without a fixed batch limit", () => {
        const results = Array.from({ length: 100 }, (_value, index) => asset(`result-${index + 1}`));
        const markup = renderToStaticMarkup(<CreativeResultSwitcher results={results} selectedIndex={99} width={352} height={320} renderThumbnail={(_result, index) => <span>预览 {index + 1}</span>} onSelect={() => undefined} />);

        expect(markup).toContain('data-results-count="100"');
        expect(markup).toContain('aria-label="查看生成结果 100"');
        expect(markup).toContain('aria-label="第 100 项，共 100 项"');
        expect(markup).toContain("100 / 100");
    });
});

function asset(id: string): CreativeAsset {
    return { id, userId: "user", conversationId: "conversation", ordinal: 0, type: "image", status: "ready", title: id, serverUrl: `/${id}.png`, metadata: {}, createdAt: 1, updatedAt: 1 };
}
