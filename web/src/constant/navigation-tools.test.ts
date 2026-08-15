import { describe, expect, it } from "vitest";

import { landingNavigationTools, navigationGroups, navigationTools } from "./navigation-tools";

describe("user navigation order", () => {
    it("keeps the landing page entries in their dedicated order", () => {
        expect(landingNavigationTools).toEqual([
            { slug: "create", label: "Agent" },
            { slug: "drama", label: "短剧" },
            { slug: "gallery", label: "广场" },
        ]);
    });

    it("keeps the unified Agent as the only generation entry in workspace navigation", () => {
        expect(navigationGroups.map((group) => group.label)).toEqual(["创作", "项目", "资产", "社区"]);
        expect(navigationTools.map((tool) => tool.slug)).not.toContain("image");
        expect(navigationTools.map((tool) => tool.slug)).not.toContain("video");
    });

    it("keeps published works and personal assets in the requested asset order", () => {
        expect(navigationTools.filter((tool) => tool.group === "assets").map((tool) => tool.label)).toEqual(["作品", "素材", "提示词", "词库"]);
        expect(navigationTools.filter((tool) => tool.group === "community").map((tool) => tool.label)).toEqual(["广场", "主页"]);
        expect(navigationTools.find((tool) => tool.group === "community")?.slug).toBe("community");
    });
});
