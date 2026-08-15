import { describe, expect, it } from "vitest";

import { findHelpArticle, helpArticles, searchHelpArticles } from "./help-content";

describe("help center content", () => {
    it("covers every user workspace with complete flows and tutorials", () => {
        expect(helpArticles.map((article) => article.id)).toEqual(["start", "agent", "image", "video", "canvas", "drama", "assets", "prompts", "account", "rights", "troubleshooting"]);
        for (const article of helpArticles) {
            expect(article.flow.length).toBeGreaterThanOrEqual(4);
            expect(article.steps.length).toBeGreaterThanOrEqual(3);
            expect(article.faqs.length).toBeGreaterThanOrEqual(2);
            expect(article.outcomes).toHaveLength(3);
            if (article.route) expect(article.route.href).toMatch(/^\//);
        }
    });

    it("resolves deep links and searches detailed instructions", () => {
        expect(findHelpArticle("canvas")?.title).toContain("节点");
        expect(searchHelpArticles("全景").map((article) => article.id)).toContain("canvas");
        expect(searchHelpArticles("订单").map((article) => article.id)).toContain("account");
        expect(searchHelpArticles("注销").map((article) => article.id)).toContain("rights");
        expect(searchHelpArticles("不存在的功能关键词")).toEqual([]);
    });
});
