import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), listPointRecordsPage: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({ listPointRecordsPage: mocks.listPointRecordsPage }));

import { GET } from "./route";

describe("GET /api/points", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.listPointRecordsPage.mockResolvedValue({ records: [], total: 0, page: 1, pageSize: 8 });
    });

    it("requires an authenticated user", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);

        expect((await GET(new Request("http://localhost/api/points"))).status).toBe(401);
        expect(mocks.listPointRecordsPage).not.toHaveBeenCalled();
    });

    it("forwards server-side debit filtering and pagination", async () => {
        await GET(new Request("http://localhost/api/points?page=3&pageSize=8&direction=debit"));

        expect(mocks.listPointRecordsPage).toHaveBeenCalledWith("user-one", { page: 3, pageSize: 8, direction: "debit" });
    });

    it("ignores unsupported direction values", async () => {
        await GET(new Request("http://localhost/api/points?direction=unknown"));

        expect(mocks.listPointRecordsPage).toHaveBeenCalledWith("user-one", { page: 1, pageSize: 10, direction: undefined });
    });
});
