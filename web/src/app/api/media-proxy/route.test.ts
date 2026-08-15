import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    checkMediaProxyRateLimit: vi.fn(),
    acquire: vi.fn(),
    wrap: vi.fn(),
    release: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => ({ id: "user-one" })) }));
vi.mock("@/lib/server/security", () => ({
    checkMediaProxyRateLimit: mocks.checkMediaProxyRateLimit,
    isSafeOutboundUrl: vi.fn(async () => true),
    rateLimitHeaders: vi.fn(() => ({ "Retry-After": "60" })),
}));
vi.mock("@/lib/server/media-concurrency", () => ({ acquireMediaConcurrency: mocks.acquire, withMediaConcurrency: mocks.wrap }));
vi.mock("@/lib/server/safe-outbound-fetch", () => ({ fetchSafeOutbound: (url: string | URL, init?: RequestInit) => fetch(url, init) }));

import { GET, HEAD } from "./route";
import { MEDIA_SNIFF_RANGE } from "@/lib/server/media-content-validation";

describe("media proxy", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mocks.checkMediaProxyRateLimit.mockResolvedValue({ allowed: true, remaining: 119, resetAt: Date.now() + 60_000 });
        mocks.release.mockReset();
        mocks.acquire.mockReturnValue({ release: mocks.release });
        mocks.wrap.mockImplementation((response: Response) => response);
    });

    it("blocks excess concurrent proxy reads before fetching upstream", async () => {
        mocks.acquire.mockReturnValue(null);
        const fetchMock = vi.spyOn(globalThis, "fetch");
        const response = await GET(request());
        expect(response.status).toBe(429);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects multiple ranges and bounds open ranges before forwarding", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(new Response(mp4Bytes(), { status: 206, headers: { "content-type": "application/octet-stream" } }))
            .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { "content-type": "text/html" } }));
        const invalid = await GET(request({ range: "bytes=0-1,4-5" }));
        expect(invalid.status).toBe(416);
        expect(fetchMock).not.toHaveBeenCalled();

        const response = await GET(request({ range: "bytes=100-" }));
        expect(response.status).toBe(206);
        expect(fetchMock).toHaveBeenNthCalledWith(1, expect.any(URL), expect.objectContaining({ method: "GET", headers: expect.objectContaining({ Range: MEDIA_SNIFF_RANGE }) }));
        expect(fetchMock).toHaveBeenNthCalledWith(2, expect.any(URL), expect.objectContaining({ headers: expect.objectContaining({ Range: `bytes=100-${100 + 32 * 1024 * 1024 - 1}` }) }));
        expect(response.headers.get("content-type")).toBe("video/mp4");
    });

    it("blocks requests before fetching when the rate limit is exhausted", async () => {
        mocks.checkMediaProxyRateLimit.mockResolvedValue({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });
        const fetchMock = vi.spyOn(globalThis, "fetch");

        const response = await GET(request());

        expect(response.status).toBe(429);
        expect(response.headers.get("retry-after")).toBe("60");
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects an upstream response with an oversized content length", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("x", { headers: { "content-length": String(300 * 1024 * 1024 + 1) } }));

        const response = await GET(request());

        expect(response.status).toBe(413);
    });

    it("uses private caching for authenticated media", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(pngBytes(), { headers: { "content-type": "text/html" } }));

        const response = await GET(request());

        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("private, max-age=600");
        expect(response.headers.get("cross-origin-resource-policy")).toBe("same-site");
        expect(response.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
        expect(response.headers.get("content-type")).toBe("image/png");
    });

    it("accepts real media returned as application/octet-stream", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(pngBytes(), { headers: { "content-type": "application/octet-stream" } }));

        const response = await GET(request());

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/png");
        expect(new Uint8Array(await response.arrayBuffer())).toEqual(pngBytes());
    });

    it("probes bytes before returning HEAD metadata", async () => {
        const fetchMock = vi
            .spyOn(globalThis, "fetch")
            .mockResolvedValueOnce(new Response(pngBytes(), { status: 206, headers: { "content-type": "application/octet-stream" } }))
            .mockResolvedValueOnce(new Response(null, { headers: { "content-length": "1234", "content-type": "text/html" } }));

        const response = await HEAD(request());

        expect(response.status).toBe(200);
        expect(response.body).toBeNull();
        expect(response.headers.get("content-type")).toBe("image/png");
        expect(response.headers.get("content-length")).toBe("1234");
        expect(fetchMock.mock.calls[0][1]?.method).toBe("GET");
        expect(fetchMock.mock.calls[1][1]?.method).toBe("HEAD");
    });

    it.each([
        ["HTML", "<!doctype html><script>alert(1)</script>", "image/png"],
        ["JavaScript", "alert(document.domain)", "video/mp4"],
        ["SVG", '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', "image/svg+xml"],
    ])("rejects executable %s even when the upstream MIME type claims media", async (_name, source, contentType) => {
        const cancel = vi.fn();
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(unsafeBody(source, cancel), { headers: { "content-type": contentType } }));

        const response = await GET(request());

        expect(response.status).toBe(415);
        expect(cancel).toHaveBeenCalled();
        expect(mocks.release).toHaveBeenCalled();
    });
});

function request(headers?: HeadersInit) {
    return new Request(`http://localhost/api/media-proxy?url=${encodeURIComponent("https://cdn.example.com/media.png")}`, { headers });
}

function pngBytes() {
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
}

function mp4Bytes() {
    return new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31]);
}

function unsafeBody(source: string, cancel: (reason?: unknown) => void) {
    const bytes = new TextEncoder().encode(source);
    return new ReadableStream<Uint8Array>({
        start(controller) {
            const repeated = new Uint8Array(8 * 1024);
            for (let offset = 0; offset < repeated.length; offset += bytes.length) repeated.set(bytes.subarray(0, Math.min(bytes.length, repeated.length - offset)), offset);
            controller.enqueue(repeated);
        },
        cancel(reason) {
            cancel(reason);
        },
    });
}
