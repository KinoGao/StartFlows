import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { Readable } from "node:stream";
import sharp from "sharp";

import { ensureMediaFileExtension, mediaDownloadFileName } from "@/lib/media-file";
import { normalizeImagePreviewWidth } from "@/lib/media-image-variant";
import { getOrCreateCachedImageVariant } from "@/lib/server/media-image-variant-cache";

const MAX_INPUT_PIXELS = 100_000_000;
export const MAX_MEDIA_RANGE_BYTES = 32 * 1024 * 1024;
const MEDIA_SECURITY_HEADERS = {
    "Cross-Origin-Resource-Policy": "same-site",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow, noarchive",
};

export async function createLocalMediaResponse(request: Request, filePath: string, mimeType: string, headers: Record<string, string> = {}) {
    const info = await stat(filePath).catch(() => null);
    if (!info?.isFile()) return null;
    const downloadOriginal = new URL(request.url).searchParams.get("download") === "original";
    const imageVariant = requestedImageVariant(request, mimeType);
    if (imageVariant) {
        const response = await createImageVariantResponse(request, filePath, info, imageVariant, headers).catch(() => null);
        if (response) return response;
    }
    const range = parseRange(request.headers.get("range"), info.size);
    if (range === "invalid") {
        return new Response(null, {
            status: 416,
            headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes */${info.size}`, ...responseHeaders(headers, downloadOriginal, filePath) },
        });
    }
    const length = range ? range.end - range.start + 1 : info.size;
    const etag = `W/"${info.size}-${Math.trunc(info.mtimeMs)}"`;
    const responseHeaderValues = {
        "Content-Type": mimeType,
        "Content-Length": String(length),
        "Accept-Ranges": "bytes",
        ETag: etag,
        "Last-Modified": info.mtime.toUTCString(),
        ...(range ? { "Content-Range": `bytes ${range.start}-${range.end}/${info.size}` } : {}),
        ...responseHeaders(headers, downloadOriginal, filePath),
    };
    if (
        !range &&
        request.headers
            .get("if-none-match")
            ?.split(",")
            .map((value) => value.trim())
            .includes(etag)
    ) {
        const { "Content-Length": _contentLength, ...notModifiedHeaders } = responseHeaderValues;
        return new Response(null, { status: 304, headers: notModifiedHeaders });
    }
    if (request.method === "HEAD") return new Response(null, { status: range ? 206 : 200, headers: responseHeaderValues });

    const stream = createReadStream(filePath, range ? { start: range.start, end: range.end } : undefined);
    return new Response(Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>, {
        status: range ? 206 : 200,
        headers: responseHeaderValues,
    });
}

export function createMediaHeadResponse(mimeType: string, bytes: number, headers: Record<string, string> = {}) {
    return new Response(null, {
        status: 200,
        headers: {
            "Content-Type": mimeType || "application/octet-stream",
            "Content-Length": String(Math.max(0, Math.floor(bytes) || 0)),
            "Accept-Ranges": "bytes",
            ...secureMediaHeaders(headers),
        },
    });
}

export type MediaImageVariant = { format: "webp"; width: number };

async function createImageVariantResponse(request: Request, filePath: string, info: { size: number; mtimeMs: number }, variant: MediaImageVariant, headers: Record<string, string>) {
    const cacheKey = `${info.size}-${Math.trunc(info.mtimeMs)}-${variant.format}-${variant.width || "full"}`;
    const etag = `W/"${cacheKey}"`;
    const responseHeaders = {
        ...secureMediaHeaders(headers),
        "Content-Type": `image/${variant.format}`,
        "Content-Disposition": `inline; filename="${variantFileName(filePath, variant.format)}"`,
        ETag: etag,
        Vary: "Accept",
    };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: responseHeaders });

    const body = await getOrCreateCachedImageVariant(`local:${filePath}:${cacheKey}`, () =>
        sharp(filePath, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).rotate().resize({ width: variant.width, withoutEnlargement: true, fit: "inside" }).webp({ quality: 82, effort: 4 }).toBuffer(),
    );
    return new Response(request.method === "HEAD" ? null : new Uint8Array(body), { status: 200, headers: { ...responseHeaders, "Content-Length": String(body.length) } });
}

export function requestedImageVariant(request: Request, mimeType: string): MediaImageVariant | null {
    if (!/^image\/(?:png|jpe?g|webp)$/i.test(mimeType)) return null;
    const url = new URL(request.url);
    if (url.searchParams.get("download") === "original") return null;
    const explicitWebp = url.searchParams.get("format") === "webp";
    const browserImageRequest = request.headers.get("sec-fetch-dest") === "image" && request.headers.get("accept")?.includes("image/webp");
    if (!explicitWebp && !browserImageRequest) return null;
    return { format: "webp", width: normalizeImagePreviewWidth(url.searchParams.get("width")) };
}

function variantFileName(filePath: string, format: MediaImageVariant["format"]) {
    return `${basename(filePath, extname(filePath)).replace(/[^a-z0-9_-]/gi, "-") || "image"}.${format}`;
}

function responseHeaders(headers: Record<string, string>, downloadOriginal: boolean, filePath: string) {
    const secureHeaders = secureMediaHeaders(headers);
    if (!downloadOriginal) return secureHeaders;
    const existing = headers["Content-Disposition"] || headers["content-disposition"];
    return {
        ...secureHeaders,
        "Content-Disposition": existing ? existing.replace(/^inline\b/i, "attachment") : mediaContentDisposition("attachment", basename(filePath)),
    };
}

function secureMediaHeaders(headers: Record<string, string>) {
    return { ...MEDIA_SECURITY_HEADERS, ...headers };
}

export function mediaContentDisposition(disposition: "inline" | "attachment", fileName: string, mimeType?: string, storageKey = "") {
    const mediaFileName = /^(?:image|video|audio)\//i.test(mimeType || "") ? (disposition === "attachment" ? mediaDownloadFileName(fileName, mimeType, storageKey) : ensureMediaFileExtension(fileName, mimeType)) : fileName;
    const cleanName = basename(mediaFileName.replace(/\\/g, "/"))
        .replace(/[\u0000-\u001f\u007f"\\]/g, "-")
        .replace(/[\uD800-\uDFFF]/g, "")
        .slice(0, 260);
    const asciiName = cleanName.replace(/[^\x20-\x7e]/g, "_") || "media";
    return `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(cleanName || "media")}`;
}

function parseRange(value: string | null, size: number): { start: number; end: number } | "invalid" | null {
    if (!value) return null;
    const match = value?.match(/^bytes=(\d*)-(\d*)$/);
    if (!match || size <= 0) return "invalid";
    if (!match[1]) {
        const suffixLength = Number(match[2]);
        if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return "invalid";
        const length = Math.min(size, suffixLength, MAX_MEDIA_RANGE_BYTES);
        return { start: size - length, end: size - 1 };
    }
    const start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size || requestedEnd < start) return "invalid";
    return { start, end: Math.min(size - 1, requestedEnd, start + MAX_MEDIA_RANGE_BYTES - 1) };
}
