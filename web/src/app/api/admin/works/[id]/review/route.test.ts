import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    audit: vi.fn(),
    currentUser: vi.fn(),
    readBody: vi.fn(),
    review: vi.fn(),
}));

vi.mock("@/lib/auth/request", () => ({ readJsonBody: mocks.readBody }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: mocks.audit }));
vi.mock("@/lib/server/work-publication-service", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/server/work-publication-service")>()),
    reviewWorkPublication: mocks.review,
}));

import { POST } from "./route";

const context = { params: Promise.resolve({ id: "work-one" }) };

describe("POST /api/admin/works/[id]/review", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.readBody.mockResolvedValue({ versionId: "version-one", decision: "approved" });
        mocks.review.mockResolvedValue({ id: "work-one", currentVersion: { title: "作品" } });
    });

    it("does not expose review actions to ordinary users", async () => {
        mocks.currentUser.mockResolvedValue({ id: "user-one", username: "user", role: "user" });

        const response = await POST(new Request("http://localhost/api/admin/works/work-one/review", { method: "POST" }), context);

        expect(response.status).toBe(403);
        expect(mocks.review).not.toHaveBeenCalled();
    });

    it("passes the authenticated administrator identity into the atomic review service", async () => {
        mocks.currentUser.mockResolvedValue({ id: "admin-one", username: "admin", role: "admin", status: "active", adminPermissions: ["content.manage"] });

        const response = await POST(new Request("http://localhost/api/admin/works/work-one/review", { method: "POST" }), context);

        expect(response.status).toBe(200);
        expect(mocks.review).toHaveBeenCalledWith({ reviewerUserId: "admin-one", workId: "work-one", versionId: "version-one", decision: "approved", reason: undefined });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.work.approve" }));
    });
});
