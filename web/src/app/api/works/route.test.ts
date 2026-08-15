import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    audit: vi.fn(),
    create: vi.fn(),
    currentUser: vi.fn(),
    readBody: vi.fn(),
}));

vi.mock("@/lib/auth/request", () => ({ readJsonBody: mocks.readBody }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.currentUser }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: mocks.audit }));
vi.mock("@/lib/server/work-publication-service", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/server/work-publication-service")>()),
    createWorkPublicationDraft: mocks.create,
    listWorkPublicationsForUser: vi.fn(),
}));

import { POST } from "./route";

describe("POST /api/works", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.readBody.mockResolvedValue({ sourceType: "media", sourceId: "asset-one" });
        mocks.create.mockResolvedValue({ id: "work-one", sourceType: "media", currentVersion: { title: "作品", visibility: "public" } });
    });

    it("requires an authenticated user", async () => {
        mocks.currentUser.mockResolvedValue(null);

        const response = await POST(new Request("http://localhost/api/works", { method: "POST" }));

        expect(response.status).toBe(401);
        expect(mocks.create).not.toHaveBeenCalled();
    });

    it("uses the server session user id instead of accepting an owner from the body", async () => {
        mocks.currentUser.mockResolvedValue({ id: "session-user", username: "user", role: "user" });
        mocks.readBody.mockResolvedValue({ sourceType: "media", sourceId: "asset-one", ownerUserId: "other-user" });

        const response = await POST(new Request("http://localhost/api/works", { method: "POST" }));

        expect(response.status).toBe(201);
        expect(mocks.create).toHaveBeenCalledWith("session-user", expect.objectContaining({ ownerUserId: "other-user" }));
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "work.publication.create", target: expect.objectContaining({ id: "work-one" }) }));
    });
});
