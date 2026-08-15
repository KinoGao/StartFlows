import { mkdir, readFile, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";

import { createLocalMediaResponse, MAX_MEDIA_RANGE_BYTES, mediaContentDisposition, requestedImageVariant } from "./local-media-response";

const directory = resolve(tmpdir(), `vozeb-pro-media-response-${process.pid}-${Date.now()}`);
const filePath = resolve(directory, "sample.mp4");
const largeFilePath = resolve(directory, "large.mp4");
const imagePath = resolve(directory, "sample.png");

describe("local media response", () => {
    beforeAll(async () => {
        await mkdir(directory, { recursive: true });
        await writeFile(filePath, Buffer.from("0123456789"));
        await writeFile(largeFilePath, "");
        await truncate(largeFilePath, MAX_MEDIA_RANGE_BYTES + 1024);
        await sharp({ create: { width: 128, height: 64, channels: 4, background: "#38a169" } })
            .png()
            .toFile(imagePath);
    });

    afterAll(() => rm(directory, { recursive: true, force: true }));

    it("streams the whole file without loading it into a response buffer", async () => {
        const response = await createLocalMediaResponse(new Request("http://localhost/media"), filePath, "video/mp4");
        expect(response?.status).toBe(200);
        expect(response?.headers.get("content-length")).toBe("10");
        expect(response?.headers.get("cross-origin-resource-policy")).toBe("same-site");
        expect(response?.headers.get("x-content-type-options")).toBe("nosniff");
        expect(response?.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
        expect(await response?.text()).toBe("0123456789");
    });

    it("streams only the requested byte range", async () => {
        const response = await createLocalMediaResponse(new Request("http://localhost/media", { headers: { range: "bytes=2-5" } }), filePath, "video/mp4");
        expect(response?.status).toBe(206);
        expect(response?.headers.get("content-range")).toBe("bytes 2-5/10");
        expect(await response?.text()).toBe("2345");
    });

    it("rejects malformed ranges instead of streaming the whole file", async () => {
        const response = await createLocalMediaResponse(new Request("http://localhost/media", { headers: { range: "bytes=invalid" } }), filePath, "video/mp4");
        expect(response?.status).toBe(416);
        expect(response?.headers.get("content-range")).toBe("bytes */10");
    });

    it("rejects multiple ranges and caps explicit or open-ended ranges to one bounded segment", async () => {
        const multiple = await createLocalMediaResponse(new Request("http://localhost/media", { headers: { range: "bytes=0-1,4-5" } }), filePath, "video/mp4");
        expect(multiple?.status).toBe(416);

        const explicit = await createLocalMediaResponse(new Request("http://localhost/media", { method: "HEAD", headers: { range: "bytes=0-999999999" } }), largeFilePath, "video/mp4");
        expect(explicit?.status).toBe(206);
        expect(explicit?.headers.get("content-length")).toBe(String(MAX_MEDIA_RANGE_BYTES));
        expect(explicit?.headers.get("content-range")).toBe(`bytes 0-${MAX_MEDIA_RANGE_BYTES - 1}/${MAX_MEDIA_RANGE_BYTES + 1024}`);

        const openEnded = await createLocalMediaResponse(new Request("http://localhost/media", { method: "HEAD", headers: { range: "bytes=1024-" } }), largeFilePath, "video/mp4");
        expect(openEnded?.headers.get("content-length")).toBe(String(MAX_MEDIA_RANGE_BYTES));
    });

    it("returns metadata without a body for HEAD and supports original conditional cache hits", async () => {
        const head = await createLocalMediaResponse(new Request("http://localhost/media", { method: "HEAD" }), filePath, "video/mp4");
        expect(head?.status).toBe(200);
        expect(head?.headers.get("content-length")).toBe("10");
        expect(head?.headers.get("etag")).toBeTruthy();
        expect(head?.headers.get("last-modified")).toBeTruthy();
        await expect(head?.text()).resolves.toBe("");

        const cached = await createLocalMediaResponse(new Request("http://localhost/media", { headers: { "if-none-match": head?.headers.get("etag") || "" } }), filePath, "video/mp4");
        expect(cached?.status).toBe(304);
        expect(cached?.headers.get("content-length")).toBeNull();
    });

    it("returns a bounded WebP variant for display", async () => {
        const response = await createLocalMediaResponse(new Request("http://localhost/media?format=webp&width=64"), imagePath, "image/png");
        const body = Buffer.from(await response!.arrayBuffer());
        const metadata = await sharp(body).metadata();
        expect(response?.headers.get("content-type")).toBe("image/webp");
        expect(response?.headers.get("content-disposition")).toContain("sample.webp");
        expect(metadata).toMatchObject({ format: "webp", width: 64, height: 32 });
    });

    it("normalizes arbitrary preview widths to finite transform variants", () => {
        expect(requestedImageVariant(new Request("http://localhost/media?format=webp"), "image/png")).toEqual({ format: "webp", width: 1600 });
        expect(requestedImageVariant(new Request("http://localhost/media?format=webp&width=65"), "image/png")).toEqual({ format: "webp", width: 96 });
        expect(requestedImageVariant(new Request("http://localhost/media?format=webp&width=903"), "image/png")).toEqual({ format: "webp", width: 960 });
        expect(requestedImageVariant(new Request("http://localhost/media?format=webp&width=999999"), "image/png")).toEqual({ format: "webp", width: 2048 });
    });

    it("returns the untouched original image as an attachment for download", async () => {
        const response = await createLocalMediaResponse(new Request("http://localhost/media?download=original", { headers: { accept: "image/webp", "sec-fetch-dest": "image" } }), imagePath, "image/png", {
            "Content-Disposition": 'inline; filename="uploaded-image.png"',
        });
        const body = Buffer.from(await response!.arrayBuffer());
        const metadata = await sharp(body).metadata();
        expect(response?.headers.get("content-type")).toBe("image/png");
        expect(response?.headers.get("content-disposition")).toBe('attachment; filename="uploaded-image.png"');
        expect(body.equals(await readFile(imagePath))).toBe(true);
        expect(metadata).toMatchObject({ format: "png", width: 128, height: 64 });
    });

    it("keeps original video bytes and adds the MIME-matched extension", async () => {
        const response = await createLocalMediaResponse(new Request("http://localhost/media?download=original"), filePath, "video/mp4", {
            "Content-Disposition": mediaContentDisposition("inline", "generated-video", "video/mp4"),
        });
        expect(response?.headers.get("content-type")).toBe("video/mp4");
        expect(response?.headers.get("content-disposition")).toContain('filename="generated-video.mp4"');
        expect(Buffer.from(await response!.arrayBuffer()).equals(await readFile(filePath))).toBe(true);
    });

    it("corrects a stale preview extension in download response names", () => {
        expect(mediaContentDisposition("attachment", "generated-image.webp", "image/png")).toMatch(/filename="\d{8}-\d{6}-[a-f0-9]{8}\.png"/);
        expect(mediaContentDisposition("attachment", "generated-video", "video/webm")).toMatch(/filename="\d{8}-\d{6}-[a-f0-9]{8}\.webm"/);
    });

    it("uses WebP automatically for browser image requests and supports conditional cache hits", async () => {
        const request = new Request("http://localhost/media", { headers: { accept: "image/avif,image/webp,*/*", "sec-fetch-dest": "image" } });
        const response = await createLocalMediaResponse(request, imagePath, "image/png");
        expect(response?.headers.get("content-type")).toBe("image/webp");
        const etag = response?.headers.get("etag") || "";
        const cached = await createLocalMediaResponse(new Request("http://localhost/media", { headers: { accept: "image/webp", "sec-fetch-dest": "image", "if-none-match": etag } }), imagePath, "image/png");
        expect(cached?.status).toBe(304);
        expect(cached?.headers.get("x-content-type-options")).toBe("nosniff");
    });
});
