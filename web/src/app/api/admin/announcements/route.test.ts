import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    listAnnouncementsPage: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/store", () => ({
    createAnnouncement: vi.fn(),
    isAuthInputError: vi.fn(() => false),
    listAnnouncementsPage: mocks.listAnnouncementsPage,
}));

import { GET } from "./route";

describe("GET /api/admin/announcements", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.listAnnouncementsPage.mockResolvedValue({ items: [], total: 31, page: 3, pageSize: 12 });
    });

    it("requires authentication and administrator access", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "user-one", role: "user" });

        expect((await GET(new Request("http://localhost/api/admin/announcements"))).status).toBe(401);
        expect((await GET(new Request("http://localhost/api/admin/announcements"))).status).toBe(403);
        expect(mocks.listAnnouncementsPage).not.toHaveBeenCalled();
    });

    it("passes pagination parameters and returns page metadata", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["content.manage"] });

        const response = await GET(new Request("http://localhost/api/admin/announcements?page=3&pageSize=12"));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ announcements: [], total: 31, page: 3, pageSize: 12 });
        expect(mocks.listAnnouncementsPage).toHaveBeenCalledWith(true, { page: 3, pageSize: 12 });
    });

    it("rejects unsafe pagination values before the repository boundary", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["content.manage"] });

        await GET(new Request("http://localhost/api/admin/announcements?page=999999999999999999999&pageSize=-1"));

        expect(mocks.listAnnouncementsPage).toHaveBeenCalledWith(true, { page: 1, pageSize: 12 });
    });
});
