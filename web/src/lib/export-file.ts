export function safeExportFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_");
}

export function exportFileExtension(mimeType: string, fallback: string) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
    return fallback === "image" || fallback.startsWith("image:") ? "png" : "bin";
}
