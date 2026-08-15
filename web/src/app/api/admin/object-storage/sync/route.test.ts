import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    migrate: vi.fn(),
    audit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/object-storage-service", () => ({ migrateLocalMediaToObjectStorage: mocks.migrate }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin" })), safeRecordAuditLog: mocks.audit }));

import { POST } from "./route";

describe("POST /api/admin/object-storage/sync", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", status: "active", adminPermissions: ["system.manage"] });
        mocks.migrate.mockResolvedValue({ migrated: 2, skipped: 1, failed: 0, remaining: 3, errors: [] });
    });

    it("records every migration batch outcome", async () => {
        const response = await POST(
            new Request("http://localhost/api/admin/object-storage/sync", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ limit: 30 }),
            }),
        );

        expect(response.status).toBe(200);
        expect(mocks.migrate).toHaveBeenCalledWith(30);
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.object-storage.migrate", metadata: { migrated: 2, skipped: 1, failed: 0, remaining: 3 } }));
    });
});
