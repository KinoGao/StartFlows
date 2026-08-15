import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
    currentUser: vi.fn(),
    getSource: vi.fn(),
    listSources: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/server/work-publication-service", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/server/work-publication-service")>()),
    getWorkPublicationSource: mocks.getSource,
    listWorkPublicationSources: mocks.listSources,
}));

import { GET } from "./route";

describe("GET /api/works/sources", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.currentUser.mockResolvedValue({ id: "user-one", role: "user", status: "active" });
        mocks.listSources.mockResolvedValue({ items: [], total: 225, page: 2, pageSize: 25 });
        mocks.getSource.mockResolvedValue({ sourceType: "media", sourceId: "asset-one", title: "素材", candidates: [] });
    });

    it("lists one source type with server pagination and remote search", async () => {
        const response = await GET(new NextRequest("http://localhost/api/works/sources?sourceType=media&page=2&pageSize=25&keyword=%E6%B5%B7%E8%BE%B9"));

        expect(response.status).toBe(200);
        expect(mocks.listSources).toHaveBeenCalledWith("user-one", { sourceType: "media", page: 2, pageSize: 25, keyword: "海边" });
        expect(await response.json()).toMatchObject({ code: 0, data: { total: 225, page: 2, pageSize: 25 } });
    });

    it("uses sourceId only for the stable selected-source detail path", async () => {
        const response = await GET(new NextRequest("http://localhost/api/works/sources?sourceType=media&sourceId=asset-one"));

        expect(response.status).toBe(200);
        expect(mocks.getSource).toHaveBeenCalledWith("user-one", "media", "asset-one");
        expect(mocks.listSources).not.toHaveBeenCalled();
    });
});
