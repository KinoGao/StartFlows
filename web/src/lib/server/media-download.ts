import { open } from "node:fs/promises";

import { fetchInternalApi } from "@/lib/server/internal-origin";
import { fetchSafeOutbound } from "@/lib/server/safe-outbound-fetch";

export async function downloadMediaToFile(url: string, path: string, input: { origin: string; cookie?: string; internalHeaders?: HeadersInit; maxBytes: number; timeoutMs?: number }) {
    const source = url.trim();
    if (!source) throw new Error("媒体地址为空");
    const internal = source.startsWith("/");
    const target = internal ? `${input.origin.replace(/\/+$/, "")}${source}` : source;
    const internalHeaders = new Headers(input.internalHeaders);
    if (input.cookie) internalHeaders.set("cookie", input.cookie);
    const response = internal ? await fetchInternalApi(target, { headers: internalHeaders, signal: AbortSignal.timeout(input.timeoutMs || 3 * 60_000) }) : await fetchExternalMedia(target, input.timeoutMs || 3 * 60_000);
    if (!response.ok) throw new Error(`媒体下载失败（${response.status}）`);
    if (!response.body) throw new Error("媒体文件为空");
    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > input.maxBytes) throw new Error("媒体文件超过大小限制");

    const file = await open(path, "w");
    let bytes = 0;
    try {
        const reader = response.body.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > input.maxBytes) {
                await reader.cancel();
                throw new Error("媒体文件超过大小限制");
            }
            await file.write(value);
        }
    } finally {
        await file.close();
    }
    if (!bytes) throw new Error("媒体文件为空");
    return { bytes, mimeType: response.headers.get("content-type")?.split(";", 1)[0] || "video/mp4" };
}

async function fetchExternalMedia(initialUrl: string, timeoutMs: number) {
    let target = initialUrl;
    for (let redirects = 0; redirects <= 3; redirects += 1) {
        const response = await fetchSafeOutbound(target, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
        if (![301, 302, 303, 307, 308].includes(response.status)) return response;
        const location = response.headers.get("location");
        if (!location) throw new Error("媒体重定向地址无效");
        target = new URL(location, target).toString();
    }
    throw new Error("媒体重定向次数过多");
}
