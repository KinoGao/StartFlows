import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    audit: vi.fn(),
    currentUser: vi.fn(),
    relist: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: mocks.audit }));
vi.mock("@/lib/server/work-publication-service", () => ({ relistWorkPublication: mocks.relist }));

import { POST } from "./route";

const context = { params: Promise.resolve({ id: "work-one" }) };

describe("POST /api/works/[id]/relist", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.relist.mockResolvedValue({ id: "work-one", currentVersion: { title: "作品" } });
    });

    it("requires an authenticated owner", async () => {
        mocks.currentUser.mockResolvedValue(null);

        const response = await POST(new Request("http://localhost/api/works/work-one/relist", { method: "POST" }), context);

        expect(response.status).toBe(401);
        expect(mocks.relist).not.toHaveBeenCalled();
    });

    it("uses the session owner and records a re-list audit event", async () => {
        mocks.currentUser.mockResolvedValue({ id: "user-one", username: "user", role: "user" });

        const response = await POST(new Request("http://localhost/api/works/work-one/relist", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.relist).toHaveBeenCalledWith("user-one", "work-one");
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "work.publication.relist", target: expect.objectContaining({ id: "work-one" }) }));
    });
});
