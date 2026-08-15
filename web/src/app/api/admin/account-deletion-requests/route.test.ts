import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), list: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/server/account-deletion-request-service", () => ({ listAdminAccountDeletionRequests: mocks.list }));

import { GET } from "./route";

describe("administrator account deletion request API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.user.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["users.manage"] });
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 20 });
    });

    it("requires an administrator", async () => {
        mocks.user.mockResolvedValueOnce(null);
        expect((await GET(request())).status).toBe(401);
        mocks.user.mockResolvedValueOnce({ id: "user-one", role: "user" });
        expect((await GET(request())).status).toBe(403);
    });

    it("passes server-side filters and pagination", async () => {
        const response = await GET(request("?page=2&pageSize=20&keyword=creator&status=pending"));

        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ code: 0, data: { items: [], total: 0, page: 2, pageSize: 20 }, msg: "OK" });
        expect(mocks.list).toHaveBeenCalledWith({ page: 2, pageSize: 20, keyword: "creator", status: "pending" });
    });
});

function request(search = "") {
    return new Request(`http://localhost/api/admin/account-deletion-requests${search}`);
}
