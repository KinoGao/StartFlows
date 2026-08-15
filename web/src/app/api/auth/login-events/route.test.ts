import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    listUserLoginEvents: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/audit-log-store", () => ({ listUserLoginEvents: mocks.listUserLoginEvents }));

import { GET } from "./route";

describe("GET /api/auth/login-events", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one", role: "user" });
        mocks.listUserLoginEvents.mockResolvedValue({ items: [{ id: "login-one", ip: "203.0.113.10", userAgent: "Browser A", createdAt: "2026-08-09T10:00:00.000Z" }], total: 1, page: 1, pageSize: 8 });
    });

    it("returns only the current user's paginated successful logins", async () => {
        const response = await GET(new Request("http://localhost/api/auth/login-events?page=2&pageSize=8"));

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toContain("no-store");
        expect(mocks.listUserLoginEvents).toHaveBeenCalledWith("user-one", { page: 2, pageSize: 8 });
    });

    it("requires a signed-in user", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        expect((await GET(new Request("http://localhost/api/auth/login-events"))).status).toBe(401);
        expect(mocks.listUserLoginEvents).not.toHaveBeenCalled();
    });
});
