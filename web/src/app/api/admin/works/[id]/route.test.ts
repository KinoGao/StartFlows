import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    audit: vi.fn(),
    currentUser: vi.fn(),
    remove: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: mocks.audit }));
vi.mock("@/lib/server/work-publication-service", () => ({ deleteWorkPublicationForAdmin: mocks.remove }));

import { DELETE } from "./route";

const context = { params: Promise.resolve({ id: "work-one" }) };

describe("DELETE /api/admin/works/[id]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.remove.mockResolvedValue({ id: "work-one", title: "作品" });
    });

    it("does not expose permanent deletion to ordinary users", async () => {
        mocks.currentUser.mockResolvedValue({ id: "user-one", username: "user", role: "user" });

        const response = await DELETE(new Request("http://localhost/api/admin/works/work-one", { method: "DELETE" }), context);

        expect(response.status).toBe(403);
        expect(mocks.remove).not.toHaveBeenCalled();
    });

    it("passes the administrator identity to the deletion service and records the audit event", async () => {
        mocks.currentUser.mockResolvedValue({ id: "admin-one", username: "admin", role: "admin", status: "active", adminPermissions: ["content.manage"] });

        const response = await DELETE(new Request("http://localhost/api/admin/works/work-one", { method: "DELETE" }), context);

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { deletedId: "work-one" } });
        expect(mocks.remove).toHaveBeenCalledWith("admin-one", "work-one");
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.work.delete", target: expect.objectContaining({ id: "work-one" }) }));
    });
});
