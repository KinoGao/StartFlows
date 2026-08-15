import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchPrompts, promptCategoryLabel } from "./prompts";

describe("prompt library api", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("shortens the category label without changing its stored query key", () => {
        expect(promptCategoryLabel("UI 与社交媒体")).toBe("UI 与社交");
        expect(promptCategoryLabel("人像摄影")).toBe("人像摄影");
    });

    it("queries one server page by keyword and category", async () => {
        const fetchMock = vi.fn().mockResolvedValue(Response.json({ items: [], tags: [], categories: ["海报"], total: 0 }));
        vi.stubGlobal("fetch", fetchMock);

        await fetchPrompts({ page: 1, keyword: "产品", category: "海报" });
        expect(fetchMock).toHaveBeenCalledWith("/api/prompts?keyword=%E4%BA%A7%E5%93%81&category=%E6%B5%B7%E6%8A%A5&page=1");
    });

    it("does not request facets again while loading another page", async () => {
        const fetchMock = vi.fn().mockResolvedValue(Response.json({ items: [], tags: [], categories: [], total: 40 }));
        vi.stubGlobal("fetch", fetchMock);

        await fetchPrompts({ page: 2, pageSize: 20, includeFacets: false });
        expect(fetchMock).toHaveBeenCalledWith("/api/prompts?page=2&pageSize=20&includeFacets=0");
    });
});
