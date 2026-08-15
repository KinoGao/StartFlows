import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    readAdminBackupData: vi.fn(),
    sanitizeAuthBackup: vi.fn(),
    safeRecordAuditLog: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/admin-backup-policy", () => ({ sanitizeAuthBackup: mocks.sanitizeAuthBackup }));
vi.mock("@/lib/server/admin-backup-store", () => ({ readAdminBackupData: mocks.readAdminBackupData }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin" })), safeRecordAuditLog: mocks.safeRecordAuditLog }));

import { POST } from "./route";

describe("POST /api/admin/backup/export", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "admin", status: "active", adminPermissions: ["system.manage"] });
        mocks.sanitizeAuthBackup.mockReturnValue({ users: [{ id: "user-one" }] });
        mocks.readAdminBackupData.mockResolvedValue({
            auth: { users: [{ id: "user-one", passwordHash: "secret" }] },
            prompts: { version: 1, prompts: [] },
            generationLogs: { version: 1, logs: [] },
            accountDeletionRequests: { version: 1, requests: [{ id: "request-one", email: "private@example.com" }] },
        });
    });

    it("returns a non-cacheable sanitized backup for a system administrator", async () => {
        const response = await POST(request());
        const backup = await response.json();

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toContain("no-store");
        expect(response.headers.get("content-disposition")).toContain("vozeb-pro-data-backup-");
        expect(JSON.stringify(backup)).not.toContain("passwordHash");
        expect(JSON.stringify(backup)).not.toContain("private@example.com");
        expect(mocks.safeRecordAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.backup.export", target: expect.objectContaining({ type: "backup" }) }));
    });

    it("rejects unauthenticated and non-admin users before reading backup data", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "user", role: "user" });

        expect((await POST(request())).status).toBe(401);
        expect((await POST(request())).status).toBe(403);
        expect(mocks.readAdminBackupData).not.toHaveBeenCalled();
    });
});

function request() {
    return new Request("http://localhost/api/admin/backup/export", { method: "POST" });
}
