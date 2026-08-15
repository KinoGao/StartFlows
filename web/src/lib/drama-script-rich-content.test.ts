import { describe, expect, it } from "vitest";

import { dramaRichContentToPlainText, normalizeDramaScriptRichContent, plainTextToDramaRichContent } from "./drama-script-rich-content";

describe("drama script rich content", () => {
    it("round-trips legacy plain text without storing HTML", () => {
        const content = plainTextToDramaRichContent("场景一\n角色：台词");

        expect(dramaRichContentToPlainText(content)).toBe("场景一\n角色：台词");
        expect(JSON.stringify(content)).not.toContain("<p>");
    });

    it("keeps supported formatting and removes unsafe data", () => {
        const content = normalizeDramaScriptRichContent({
            type: "doc",
            content: [
                {
                    type: "heading",
                    attrs: { level: 9, textAlign: "center", onclick: "alert(1)" },
                    content: [
                        {
                            type: "text",
                            text: "标题",
                            marks: [{ type: "bold" }, { type: "textStyle", attrs: { color: "#ef4444", fontSize: "18px", position: "fixed" } }, { type: "highlight", attrs: { color: "#fef08a" } }, { type: "link", attrs: { href: "javascript:alert(1)" } }],
                        },
                    ],
                },
            ],
        });

        expect(content).toEqual({
            type: "doc",
            content: [
                {
                    type: "heading",
                    attrs: { level: 1, textAlign: "center" },
                    content: [
                        {
                            type: "text",
                            text: "标题",
                            marks: [{ type: "bold" }, { type: "textStyle", attrs: { color: "#ef4444", fontSize: "18px" } }, { type: "highlight", attrs: { color: "#fef08a" } }],
                        },
                    ],
                },
            ],
        });
    });
});
