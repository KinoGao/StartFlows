import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { CreativeConversation } from "@/lib/creative-runtime-contract";

import { DramaAgentHistory } from "./drama-agent-history";

describe("DramaAgentHistory", () => {
    it("renders a compact project conversation switcher with the active item", () => {
        const markup = renderToStaticMarkup(
            <DramaAgentHistory
                items={[conversation("one", "第一场对话", 2), conversation("two", "第二场对话", 1)]}
                activeId="one"
                loading={false}
                hasMore
                loadingMore={false}
                onOpen={() => undefined}
                onRename={() => undefined}
                onDelete={() => undefined}
                onLoadMore={() => undefined}
            />,
        );

        expect(markup).toContain("历史对话");
        expect(markup).toContain("第一场对话");
        expect(markup).toContain("第二场对话");
        expect(markup).toContain('aria-current="true"');
        expect(markup).toContain("加载更多");
        expect(markup).toContain("管理对话：第一场对话");
        expect(markup).toContain("管理对话：第二场对话");
        expect(markup).toContain("w-[min(18rem,calc(100vw-1.5rem))]");
    });
});

function conversation(id: string, title: string, updatedAt: number): CreativeConversation {
    return { id, userId: "user", surface: "drama", source: "drama", projectId: "project", title, status: "active", contextSummary: "", contextSummaryThroughSequence: 0, createdAt: updatedAt, updatedAt, lastMessageAt: updatedAt };
}
