import { afterEach, describe, expect, it, vi } from "vitest";

import { adminBackupFileName, downloadAdminBackup, importAdminBackup } from "./admin-backup";

describe("admin backup API", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("uses and sanitizes the server backup filename", () => {
        expect(adminBackupFileName('attachment; filename="vozeb-pro:backup.json"')).toBe("vozeb-pro-backup.json");
        expect(adminBackupFileName("attachment; filename*=UTF-8''vozeb-pro-%E5%A4%87%E4%BB%BD.json")).toBe("vozeb-pro-备份.json");
    });

    it("downloads the backup through the administrator endpoint", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { headers: { "content-type": "application/json", "content-disposition": 'attachment; filename="backup.json"' } })));

        const result = await downloadAdminBackup();

        expect(result.fileName).toBe("backup.json");
        expect(await result.blob.text()).toBe("{}");
        expect(fetch).toHaveBeenCalledWith("/api/admin/backup/export", {
            method: "POST",
            cache: "no-store",
        });
    });

    it("uploads the selected JSON file as multipart form data", async () => {
        const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true, imported: ["auth"], safetyBackupDir: "restore-backups/one", removedSafetyBackups: 0 }));
        vi.stubGlobal("fetch", fetchMock);
        const file = new File(["{}"], "backup.json", { type: "application/json" });

        const result = await importAdminBackup(file);

        const init = fetchMock.mock.calls[0][1] as RequestInit;
        expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/backup");
        expect(init.method).toBe("POST");
        expect((init.body as FormData).get("file")).toBe(file);
        expect(Array.from((init.body as FormData).keys())).toEqual(["file"]);
        expect(result.imported).toEqual(["auth"]);
    });
});
