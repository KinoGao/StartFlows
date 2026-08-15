import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    authorize: vi.fn(),
    externalUrl: vi.fn(),
    rateLimit: vi.fn(),
    readReference: vi.fn(),
    stream: vi.fn(),
    head: vi.fn(),
    acquire: vi.fn(),
    wrap: vi.fn(),
    release: vi.fn(),
}));

vi.mock("@/lib/server/data-dir", () => ({ getServerDataDir: vi.fn(() => "C:/data") }));
vi.mock("@/lib/server/local-media-response", () => ({ createLocalMediaResponse: mocks.stream, createMediaHeadResponse: mocks.head, mediaContentDisposition: vi.fn(() => "inline") }));
vi.mock("@/lib/server/media-concurrency", () => ({ acquireMediaConcurrency: mocks.acquire, withMediaConcurrency: mocks.wrap }));
vi.mock("@/lib/server/object-storage-service", () => ({ createExternalMediaReadUrl: mocks.externalUrl }));
vi.mock("@/lib/server/reference-asset-store", () => ({ readReferenceAsset: mocks.readReference }));
vi.mock("@/lib/server/security", () => ({ checkPublicMediaRateLimit: mocks.rateLimit, rateLimitHeaders: vi.fn(() => ({})) }));
vi.mock("@/lib/server/work-publication-service", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/server/work-publication-service")>()),
    authorizePublicWorkPublicationAsset: mocks.authorize,
}));

import { GET, HEAD } from "./route";

const context = { params: Promise.resolve({ slug: "publicwork123", assetId: "asset-one" }) };
const localRegistration = {
    storageKey: "permanent/2026/07/27/images/work.png",
    scope: "reference",
    storageClass: "permanent",
    type: "image",
    ownerUserId: "user-one",
    source: "user-upload",
    mimeType: "image/png",
    bytes: 10,
    storageProvider: "local",
    createdAt: "2026-07-27T00:00:00.000Z",
};

describe("public work media route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 10, resetAt: Date.now() + 60_000 });
        mocks.authorize.mockResolvedValue({ asset: { id: "asset-one" }, registration: localRegistration });
        mocks.readReference.mockResolvedValue({ filePath: "C:/data/reference-assets/permanent/work.png" });
        mocks.stream.mockImplementation((request: Request) => Promise.resolve(new Response(request.method === "HEAD" ? null : new Uint8Array([1, 2]), { status: 206, headers: { "Content-Range": "bytes 0-1/10" } })));
        mocks.head.mockReturnValue(new Response(null, { status: 200, headers: { "Content-Type": "image/png", "Content-Length": "10" } }));
        mocks.acquire.mockReturnValue({ release: mocks.release });
        mocks.wrap.mockImplementation((response: Response) => response);
    });

    it("reauthorizes the current public version and preserves Range requests", async () => {
        const request = new Request("http://localhost/api/public/works/publicwork123/media/asset-one", { headers: { range: "bytes=0-1" } });
        const response = await GET(request, context);

        expect(response.status).toBe(206);
        expect(mocks.authorize).toHaveBeenCalledWith("publicwork123", "asset-one");
        expect(mocks.stream).toHaveBeenCalledWith(request, "C:/data/reference-assets/permanent/work.png", "image/png", expect.objectContaining({ "Cache-Control": "private, no-store" }));
    });

    it("returns headers without a body for HEAD", async () => {
        const response = await HEAD(new Request("http://localhost/api/public/works/publicwork123/media/asset-one", { method: "HEAD" }), context);

        expect(response.status).toBe(206);
        expect(response.headers.get("content-range")).toBe("bytes 0-1/10");
        await expect(response.text()).resolves.toBe("");
    });

    it("uses a short-lived object redirect without exposing a stored object key in the API contract", async () => {
        mocks.authorize.mockResolvedValue({ asset: { id: "asset-one" }, registration: { ...localRegistration, storageProvider: "object", externalObjectKey: "private/object.png" } });
        mocks.externalUrl.mockResolvedValue("https://objects.example.com/signed-media");

        const response = await GET(new Request("http://localhost/api/public/works/publicwork123/media/asset-one"), context);

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("https://objects.example.com/signed-media");
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(response.headers.get("cross-origin-resource-policy")).toBe("same-site");
    });

    it("answers object-backed HEAD without redirecting to a GET signature", async () => {
        mocks.authorize.mockResolvedValue({ asset: { id: "asset-one" }, registration: { ...localRegistration, storageProvider: "object", externalObjectKey: "private/object.png" } });
        const response = await HEAD(new Request("http://localhost/api/public/works/publicwork123/media/asset-one", { method: "HEAD" }), context);
        expect(response.status).toBe(200);
        expect(mocks.head).toHaveBeenCalled();
        expect(mocks.externalUrl).not.toHaveBeenCalled();
    });

    it("rejects excess concurrent reads after publication authorization", async () => {
        mocks.acquire.mockReturnValue(null);
        const response = await GET(new Request("http://localhost/api/public/works/publicwork123/media/asset-one"), context);
        expect(response.status).toBe(429);
        expect(mocks.authorize).toHaveBeenCalled();
        expect(mocks.stream).not.toHaveBeenCalled();
    });

    it("does not provide an original-download mode on public shares", async () => {
        const response = await GET(new Request("http://localhost/api/public/works/publicwork123/media/asset-one?download=original"), context);

        expect(response.status).toBe(403);
        expect(mocks.authorize).not.toHaveBeenCalled();
    });
});
