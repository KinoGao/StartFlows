import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    list: vi.fn(),
    facets: vi.fn(),
    hasSeedSource: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
    createPostgresRepositories: () => ({ prompts: mocks }),
    ensurePostgresSchema: vi.fn(),
    isPostgresDatabaseEnabled: () => true,
    withPostgresTransaction: vi.fn(),
}));

vi.mock("@/lib/server/data-adapter", () => ({
    readJsonDataFile: vi.fn(),
    writeJsonDataFile: vi.fn(),
}));

import { listPrompts } from "./store";

describe("prompt store pagination", () => {
    beforeEach(() => {
        mocks.list.mockReset().mockResolvedValue({ items: [], total: 40, page: 2, pageSize: 20 });
        mocks.facets.mockReset().mockResolvedValue({ tags: ["海报"], categories: ["设计"], scopeTotal: 963 });
        mocks.hasSeedSource.mockReset().mockResolvedValue(true);
    });

    it("runs only the bounded page query when later pages omit facets", async () => {
        await expect(listPrompts({ scope: "library", keyword: "产品", category: "设计", page: 2, pageSize: 20, includeFacets: false })).resolves.toEqual({
            items: [],
            tags: [],
            categories: [],
            total: 40,
        });

        expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ scope: "library", keyword: "产品", category: "设计", page: 2, pageSize: 20 }));
        expect(mocks.facets).not.toHaveBeenCalled();
    });

    it("loads facets together with the first page", async () => {
        const result = await listPrompts({ scope: "library", page: 1, pageSize: 20 });

        expect(result).toMatchObject({ tags: ["海报"], categories: ["设计"], scopeTotal: 963 });
        expect(mocks.facets).toHaveBeenCalledTimes(1);
    });
});
