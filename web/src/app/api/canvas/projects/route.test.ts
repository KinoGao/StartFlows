import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), listProjects: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/canvas-project-service", () => ({
    canvasProjectError: vi.fn(),
    createCanvasProjectForUser: vi.fn(),
    deleteCanvasProjectsForUser: vi.fn(),
    listCanvasProjectsForUser: mocks.listProjects,
}));

import { GET } from "./route";

describe("canvas projects route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.listProjects.mockResolvedValue({ projects: [{ id: "canvas-one", title: "画布一", nodeCount: 3, connectionCount: 1 }], total: 21, page: 2, pageSize: 12 });
    });

    it("returns lightweight project summaries", async () => {
        const response = await GET(new Request("http://localhost/api/canvas/projects?page=2&pageSize=12"));

        expect(mocks.listProjects).toHaveBeenCalledWith("user-one", { page: "2", pageSize: "12" });
        expect(await response.json()).toEqual({ code: 0, data: { projects: [{ id: "canvas-one", title: "画布一", nodeCount: 3, connectionCount: 1 }], total: 21, page: 2, pageSize: 12 }, msg: "OK" });
    });
});
