import { afterEach, describe, expect, it, vi } from "vitest";

import { listDramaProjectSummaries } from "./drama-projects";

describe("drama project api", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("requests a bounded summary page", async () => {
        const fetchMock = vi.fn().mockResolvedValue(Response.json({ code: 0, data: { projects: [], total: 24, page: 2, pageSize: 12 }, msg: "OK" }));
        vi.stubGlobal("fetch", fetchMock);

        await expect(listDramaProjectSummaries({ page: 2, pageSize: 12 })).resolves.toMatchObject({ total: 24, page: 2, pageSize: 12 });
        expect(fetchMock).toHaveBeenCalledWith("/api/drama/projects?page=2&pageSize=12", { cache: "no-store" });
    });
});
