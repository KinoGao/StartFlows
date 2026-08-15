import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AgentMarkdown } from "./agent-markdown";

describe("AgentMarkdown", () => {
    it("renders model markdown as readable message content", () => {
        const source = "以下为一份**通用专业简历报告模板**。\n\n---\n\n# 个人职业简历报告\n\n## 一、个人信息\n\n**姓名：**【填写姓名】\n\n- 联系电话\n- 电子邮箱";
        const markup = renderToStaticMarkup(<AgentMarkdown>{source}</AgentMarkdown>);
        expect(markup).toContain("<strong");
        expect(markup).toContain("通用专业简历报告模板</strong>");
        expect(markup).toContain("<hr");
        expect(markup).toContain("<h1");
        expect(markup).toContain("<h2");
        expect(markup).toContain("<ul");
        expect(markup).not.toContain("**通用专业简历报告模板**");
        expect(markup).not.toContain("# 个人职业简历报告");
    });

    it("does not execute raw HTML from model output", () => {
        const markup = renderToStaticMarkup(<AgentMarkdown>{"<script>alert(1)</script>"}</AgentMarkdown>);
        expect(markup).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
        expect(markup).not.toContain("<script>");
    });

    it("preserves emoji and provides color emoji font fallbacks", () => {
        const markup = renderToStaticMarkup(<AgentMarkdown>{"表情保持完整：😊❤️🚀"}</AgentMarkdown>);

        expect(markup).toContain("表情保持完整：😊❤️🚀");
        expect(markup).toContain("Apple Color Emoji");
        expect(markup).toContain("Segoe UI Emoji");
        expect(markup).toContain("Noto Color Emoji");
    });
});
