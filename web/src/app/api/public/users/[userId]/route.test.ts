import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), getPage: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/server/work-community-service", () => ({ getPublicCreatorPage: mocks.getPage }));

import { GET } from "./route";

describe("GET /api/public/users/[userId]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.currentUser.mockResolvedValue({ id: "viewer-one" });
        mocks.getPage.mockResolvedValue({ profile: { username: "creator" }, items: [] });
    });

    it("passes the viewer and keyset pagination to the creator service", async () => {
        const request = new NextRequest("http://localhost/api/public/users/creator?limit=12&cursor=next-page");
        const response = await GET(request, { params: Promise.resolve({ userId: "creator" }) });

        expect(response.status).toBe(200);
        expect(mocks.getPage).toHaveBeenCalledWith("creator", "viewer-one", { limit: 12, cursor: "next-page" });
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { profile: { username: "creator" } } });
    });
});
