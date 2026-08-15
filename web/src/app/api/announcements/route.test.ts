import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listAnnouncementsPage: vi.fn() }));

vi.mock("@/lib/auth/store", () => ({ listAnnouncementsPage: mocks.listAnnouncementsPage }));

import { GET } from "./route";

describe("GET /api/announcements", () => {
    beforeEach(() => {
        mocks.listAnnouncementsPage.mockReset();
        mocks.listAnnouncementsPage.mockResolvedValue({ items: [{ id: "notice-one" }], total: 1, page: 1, pageSize: 20 });
    });

    it("returns only the bounded first page of visible announcements", async () => {
        const response = await GET();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ announcements: [{ id: "notice-one" }] });
        expect(mocks.listAnnouncementsPage).toHaveBeenCalledWith(false, { page: 1, pageSize: 20 });
    });
});
