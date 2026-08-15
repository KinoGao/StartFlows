const MIME_EXTENSIONS: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/bmp": "bmp",
    "image/svg+xml": "svg",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
    "video/x-m4v": "m4v",
    "video/x-matroska": "mkv",
    "video/x-msvideo": "avi",
    "video/mpeg": "mpeg",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/ogg": "ogg",
    "audio/opus": "opus",
    "audio/aac": "aac",
    "audio/flac": "flac",
    "audio/x-flac": "flac",
    "audio/mp4": "m4a",
    "audio/webm": "webm",
    "audio/pcm": "pcm",
    "application/zip": "zip",
};

const KNOWN_MEDIA_EXTENSIONS = new Set([...Object.values(MIME_EXTENSIONS), "jpeg"]);

export function mediaFileExtension(mimeType?: string, url = "", fallback = "bin") {
    const normalizedMime = mimeType?.split(";", 1)[0]?.trim().toLowerCase() || dataUrlMimeType(url);
    const fromMime = normalizedMime ? MIME_EXTENSIONS[normalizedMime] : undefined;
    if (fromMime) return fromMime;
    const fromUrl = urlExtension(url);
    return fromUrl || normalizeExtension(fallback) || "bin";
}

export function ensureMediaFileExtension(fileName: string, mimeType?: string, sourceUrl = "") {
    const extension = mediaFileExtension(mimeType, sourceUrl);
    const trimmed = fileName.trim() || `media.${extension}`;
    const current = trimmed.match(/\.([a-z0-9]{2,8})$/i)?.[1]?.toLowerCase();
    if (current && compatibleExtensions(mimeType, extension).has(current)) return trimmed;
    if (current && KNOWN_MEDIA_EXTENSIONS.has(current)) return `${trimmed.slice(0, -(current.length + 1))}.${extension}`;
    return `${trimmed}.${extension}`;
}

export function mediaDownloadFileName(identity: string, mimeType?: string, storageKey = "", now = new Date()) {
    const token = storageIdentityToken(storageKey);
    const extension = mediaFileExtension(mimeType, storageKey);
    return `${token || `${dateToken(now)}-${identityHash(identity || storageKey)}`}.${extension}`;
}

function compatibleExtensions(mimeType: string | undefined, extension: string) {
    const normalizedMime = mimeType?.split(";", 1)[0]?.trim().toLowerCase();
    return new Set(normalizedMime === "image/jpeg" || normalizedMime === "image/jpg" ? ["jpg", "jpeg"] : [extension]);
}

function dataUrlMimeType(value: string) {
    return value.match(/^data:([^;,]+)(?:;|,)/i)?.[1]?.toLowerCase() || "";
}

function urlExtension(value: string) {
    try {
        const extension = new URL(value, "http://vozeb.local").pathname.match(/\.([a-z0-9]{2,8})$/i)?.[1]?.toLowerCase();
        return extension && KNOWN_MEDIA_EXTENSIONS.has(extension) ? extension : "";
    } catch {
        return "";
    }
}

function normalizeExtension(value: string) {
    return (
        value
            .replace(/^\./, "")
            .trim()
            .toLowerCase()
            .match(/^[a-z0-9]{2,8}$/)?.[0] || ""
    );
}

function storageIdentityToken(value: string) {
    let path = value;
    try {
        path = new URL(value, "http://vozeb.local").pathname;
    } catch {
        // Keep the raw storage key.
    }
    const stem = path
        .split(/[\\/]/)
        .at(-1)
        ?.replace(/\.[a-z0-9]{2,8}$/i, "");
    const generated = stem?.match(/(\d{8}-\d{6})-([0-9a-f]{8})-[0-9a-f-]{27}$/i);
    if (generated) return `${generated[1]}-${generated[2].toLowerCase()}`;
    const uuid = stem?.match(/([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    return uuid?.[1]?.toLowerCase() || "";
}

function dateToken(value: Date) {
    return [value.getFullYear(), twoDigits(value.getMonth() + 1), twoDigits(value.getDate())].join("") + `-${[twoDigits(value.getHours()), twoDigits(value.getMinutes()), twoDigits(value.getSeconds())].join("")}`;
}

function twoDigits(value: number) {
    return String(value).padStart(2, "0");
}

function identityHash(value: string) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}
