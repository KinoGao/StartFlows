export type AdminBackupImportResult = {
    ok: true;
    imported: string[];
    safetyBackupDir: string;
    removedSafetyBackups: number;
};

export const ADMIN_BACKUP_MAX_BYTES = 30 * 1024 * 1024;

export async function downloadAdminBackup() {
    const response = await fetch("/api/admin/backup/export", {
        method: "POST",
        cache: "no-store",
    });
    if (!response.ok) throw new Error(await readBackupError(response, "导出备份失败"));
    return {
        blob: await response.blob(),
        fileName: adminBackupFileName(response.headers.get("content-disposition")),
    };
}

export async function importAdminBackup(file: File) {
    const body = new FormData();
    body.set("file", file);
    const response = await fetch("/api/admin/backup", { method: "POST", body });
    const payload = (await response.json().catch(() => null)) as AdminBackupImportResult | { error?: string } | null;
    if (!response.ok || !payload || !("ok" in payload)) throw new Error((payload && "error" in payload && payload.error) || "导入备份失败");
    return payload;
}

export function adminBackupFileName(contentDisposition: string | null, now = new Date()) {
    const extended = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const regular = contentDisposition?.match(/filename="?([^";]+)"?/i)?.[1];
    let name = extended || regular || `vozeb-pro-data-backup-${now.toISOString().slice(0, 10)}.json`;
    try {
        name = decodeURIComponent(name);
    } catch {
        // Keep the server-provided ASCII filename when percent-decoding fails.
    }
    return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").slice(0, 180) || "vozeb-pro-data-backup.json";
}

async function readBackupError(response: Response, fallback: string) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    return payload?.error || fallback;
}
