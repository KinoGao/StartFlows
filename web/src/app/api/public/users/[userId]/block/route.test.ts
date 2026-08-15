import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentUser: vi.fn(), block: vi.fn(), rateLimit: vi.fn(), audit: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/server/work-community-service", () => ({ setPublicUserBlock: mocks.block }));
vi.mock("@/lib/server/security", () => ({ checkRateLimit: mocks.rateLimit, rateLimitHeaders: vi.fn(() => ({})) }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "viewer-one" })), safeRecordAuditLog: mocks.audit }));

import { POST } from "./route";

const context = { params: Promise.resolve({ userId: "creator" }) };

describe("POST /api/public/users/[userId]/block", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.rateLimit.mockResolvedValue({ allowed: true, resetAt: Date.now() + 60_000 });
        mocks.block.mockResolvedValue({ changed: true, active: true, removedFollowCount: 1 });
    });

    it("requires authentication", async () => {
        mocks.currentUser.mockResolvedValue(null);

        const response = await POST(new Request("http://localhost/api/public/users/creator/block", { method: "POST", body: JSON.stringify({ active: true }) }), context);

        expect(response.status).toBe(401);
        expect(mocks.block).not.toHaveBeenCalled();
    });

    it("uses the session identity and records the relationship removal", async () => {
        mocks.currentUser.mockResolvedValue({ id: "viewer-one", username: "viewer", role: "user" });

        const response = await POST(new Request("http://localhost/api/public/users/creator/block", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: true }) }), context);

        expect(response.status).toBe(200);
        expect(mocks.block).toHaveBeenCalledWith("viewer-one", "creator", true);
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "community.user.block", metadata: { removedFollowCount: 1 } }));
    });
});
