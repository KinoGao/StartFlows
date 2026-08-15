import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    currentUser: vi.fn(),
    list: vi.fn(),
    submit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/server/work-governance-service", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/server/work-governance-service")>()),
    listWorkCasesForOwner: mocks.list,
    submitWorkAppeal: mocks.submit,
}));

import { GET } from "./route";

describe("GET /api/works/[id]/appeal", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.currentUser.mockResolvedValue({ id: "user-one", role: "user", status: "active" });
        mocks.list.mockResolvedValue({ items: [], total: 51, page: 3, pageSize: 20 });
    });

    it("returns the standard paged owner appeal contract", async () => {
        const response = await GET(new Request("http://localhost/api/works/work-one/appeal?page=3&pageSize=20"), { params: Promise.resolve({ id: "work-one" }) });

        expect(response.status).toBe(200);
        expect(mocks.list).toHaveBeenCalledWith("user-one", "work-one", { page: 3, pageSize: 20 });
        expect(await response.json()).toMatchObject({ code: 0, data: { items: [], total: 51, page: 3, pageSize: 20 } });
    });
});
