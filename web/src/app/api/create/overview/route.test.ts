import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getCreateWorkbenchOverview: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/create-workbench-overview-service", () => ({ getCreateWorkbenchOverview: mocks.getCreateWorkbenchOverview }));

import { GET } from "./route";

describe("GET /api/create/overview", () => {
    beforeEach(() => {
        mocks.getCurrentUser.mockReset();
        mocks.getCreateWorkbenchOverview.mockReset();
    });

    it("requires authentication", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);

        const response = await GET();

        expect(response.status).toBe(401);
        expect(mocks.getCreateWorkbenchOverview).not.toHaveBeenCalled();
    });

    it("returns the bounded overview for the current user", async () => {
        const overview = { runningTasks: [], recentAssets: [] };
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.getCreateWorkbenchOverview.mockResolvedValue(overview);

        const response = await GET();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ code: 0, data: { overview }, msg: "OK" });
        expect(mocks.getCreateWorkbenchOverview).toHaveBeenCalledWith("user-one");
    });
});
