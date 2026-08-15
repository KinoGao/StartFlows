export async function downloadUserDataExport() {
    const response = await fetch("/api/auth/data-export", { cache: "no-store" });
    if (!response.ok) throw new Error(await readError(response));
    return {
        blob: await response.blob(),
        fileName: userDataExportFileName(response.headers.get("content-disposition")),
    };
}

export function userDataExportFileName(contentDisposition: string | null, now = new Date()) {
    const extended = contentDisposition?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const regular = contentDisposition?.match(/filename="?([^";]+)"?/i)?.[1];
    let fileName = extended || regular || `vozeb-pro-personal-data-${now.toISOString().slice(0, 10)}.json`;
    try {
        fileName = decodeURIComponent(fileName);
    } catch {
        // Keep a valid server-provided ASCII filename when decoding fails.
    }
    return fileName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").slice(0, 180) || "vozeb-pro-personal-data.json";
}

async function readError(response: Response) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    return payload?.error || "个人数据导出失败";
}
