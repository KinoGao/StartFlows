import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    audit: vi.fn(),
    currentUser: vi.fn(),
    remove: vi.fn(),
}));

vi.mock("@/lib/auth/request", () => ({ readJsonBody: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: mocks.audit }));
vi.mock("@/lib/server/work-publication-service", () => ({
    deleteWorkPublicationForUser: mocks.remove,
    getWorkPublicationForUser: vi.fn(),
    updateWorkPublicationDraft: vi.fn(),
}));

import { DELETE } from "./route";

const context = { params: Promise.resolve({ id: "work-one" }) };

describe("DELETE /api/works/[id]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.remove.mockResolvedValue({ id: "work-one", title: "作品" });
    });

    it("requires an authenticated owner", async () => {
        mocks.currentUser.mockResolvedValue(null);

        const response = await DELETE(new Request("http://localhost/api/works/work-one", { method: "DELETE" }), context);

        expect(response.status).toBe(401);
        expect(mocks.remove).not.toHaveBeenCalled();
    });

    it("passes the session user to the deletion service and records the audit event", async () => {
        mocks.currentUser.mockResolvedValue({ id: "user-one", username: "user", role: "user" });

        const response = await DELETE(new Request("http://localhost/api/works/work-one", { method: "DELETE" }), context);

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { deletedId: "work-one" } });
        expect(mocks.remove).toHaveBeenCalledWith("user-one", "work-one");
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "work.publication.delete", target: expect.objectContaining({ id: "work-one" }) }));
    });
});
