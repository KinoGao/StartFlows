import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    mergeAuthBackupSecrets: vi.fn((value) => value),
    readAdminBackupData: vi.fn(),
    restoreAdminBackupData: vi.fn(),
    listDataDirectory: vi.fn(async () => []),
    audit: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => ({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["system.manage"] })) }));
vi.mock("@/lib/auth/store-normalizers", () => ({ encryptAuthDbSecretsForStorage: vi.fn((value) => value) }));
vi.mock("@/lib/server/admin-backup-policy", () => ({ mergeAuthBackupSecrets: mocks.mergeAuthBackupSecrets, sanitizeAuthBackup: vi.fn() }));
vi.mock("@/lib/server/admin-backup-store", () => ({ readAdminBackupData: mocks.readAdminBackupData, restoreAdminBackupData: mocks.restoreAdminBackupData }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-one" })), safeRecordAuditLog: mocks.audit }));
vi.mock("@/lib/server/database", () => ({ getDatabaseProvider: vi.fn(() => "file") }));
vi.mock("@/lib/server/data-adapter", () => ({
    copyDataFile: vi.fn(),
    ensureDataDirectory: vi.fn(),
    listDataDirectory: mocks.listDataDirectory,
    removeDataPath: vi.fn(),
    resolveDataPath: vi.fn(() => "C:/safe/restore-backups/current"),
    writeJsonDataFile: vi.fn(),
}));

import { POST } from "./route";

describe("POST /api/admin/backup", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.listDataDirectory.mockResolvedValue([]);
        mocks.readAdminBackupData.mockResolvedValue({
            auth: { users: [{ id: "admin-one" }], settings: {} },
            prompts: { version: 1, prompts: [], seedSources: [] },
            generationLogs: { version: 1, logs: [] },
            accountDeletionRequests: { version: 1, requests: [] },
        });
    });

    it("rejects an oversized multipart backup before parsing it", async () => {
        const response = await POST(
            new Request("http://localhost/api/admin/backup", {
                method: "POST",
                headers: { "content-type": "multipart/form-data; boundary=test", "content-length": String(30 * 1024 * 1024 + 64 * 1024 + 1) },
                body: "--test--",
            }),
        );

        expect(response.status).toBe(413);
        expect((await response.json()).error).toBe("备份文件过大，请确认文件是否正确");
    });

    it("rejects a business JSON package marked as disaster restore", async () => {
        const response = await POST(backupRequest({ backupType: "disaster", files: { prompts: { version: 1, prompts: [], seedSources: [] } } }));

        expect(response.status).toBe(400);
        expect((await response.json()).error).toContain("不能用于整库灾难恢复");
        expect(mocks.restoreAdminBackupData).not.toHaveBeenCalled();
    });

    it("allows an account-config user backup without an administrator because existing users are retained", async () => {
        const auth = { users: [{ id: "member", role: "user", status: "active" }], settings: {} };
        const response = await POST(backupRequest({ backupType: "account-config", files: { auth } }));

        expect(response.status).toBe(200);
        expect(mocks.mergeAuthBackupSecrets).toHaveBeenCalledWith(auth, expect.any(Object));
        expect(mocks.restoreAdminBackupData).toHaveBeenCalledWith(expect.any(Object), { mode: "account-config" });
        expect(mocks.audit).toHaveBeenCalledWith(
            expect.objectContaining({
                action: "admin.backup.restore",
                metadata: { mode: "account-config", imported: ["auth"] },
            }),
        );
    });
});

function backupRequest(value: unknown) {
    const formData = new FormData();
    formData.set("file", new File([JSON.stringify(value)], "backup.json", { type: "application/json" }));
    return new Request("http://localhost/api/admin/backup", { method: "POST", body: formData });
}
