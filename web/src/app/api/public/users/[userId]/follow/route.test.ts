import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), follow: vi.fn(), rateLimit: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/server/work-community-service", () => ({ setPublicCreatorFollow: mocks.follow }));
vi.mock("@/lib/server/security", () => ({ checkRateLimit: mocks.rateLimit, rateLimitHeaders: vi.fn(() => ({})) }));

import { POST } from "./route";

const context = { params: Promise.resolve({ userId: "creator" }) };

describe("POST /api/public/users/[userId]/follow", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.rateLimit.mockResolvedValue({ allowed: true, resetAt: Date.now() + 60_000 });
        mocks.follow.mockResolvedValue({ changed: true, active: true, followerCount: 2 });
    });

    it("requires authentication before changing the relation", async () => {
        mocks.currentUser.mockResolvedValue(null);

        const response = await POST(new Request("http://localhost/api/public/users/creator/follow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: true }) }), context);

        expect(response.status).toBe(401);
        expect(mocks.follow).not.toHaveBeenCalled();
    });

    it("uses the session identity and requested active state", async () => {
        mocks.currentUser.mockResolvedValue({ id: "viewer-one" });

        const response = await POST(new Request("http://localhost/api/public/users/creator/follow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: false }) }), context);

        expect(response.status).toBe(200);
        expect(mocks.follow).toHaveBeenCalledWith("viewer-one", "creator", false);
    });
});
