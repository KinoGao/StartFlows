import { describe, expect, it, vi } from "vitest";

import { inspectSafeMediaBody, MEDIA_SNIFF_BYTES, UnsupportedMediaContentError } from "./media-content-validation";

describe("media content validation", () => {
    it.each([
        ["PNG", pngBytes(), "image/png"],
        ["JPEG", jpegBytes(), "image/jpeg"],
        ["MP4", mp4Bytes(), "video/mp4"],
        ["MP3", mp3Bytes(), "audio/mpeg"],
    ])("recognizes real %s bytes without trusting an upstream MIME type", async (_name, bytes, mimeType) => {
        const inspected = await inspectSafeMediaBody(stream(bytes));

        expect(inspected.mimeType).toBe(mimeType);
        expect(new Uint8Array(await new Response(inspected.body).arrayBuffer())).toEqual(bytes);
    });

    it.each([
        ["HTML", new TextEncoder().encode("<!doctype html><script>alert(1)</script>")],
        ["JavaScript", new TextEncoder().encode("alert(document.domain)")],
        ["SVG", new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')],
        ["unknown binary", new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])],
    ])("rejects %s content and cancels its source stream", async (_name, bytes) => {
        const cancel = vi.fn();
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                const repeated = new Uint8Array(MEDIA_SNIFF_BYTES);
                for (let offset = 0; offset < repeated.length; offset += bytes.length) repeated.set(bytes.subarray(0, Math.min(bytes.length, repeated.length - offset)), offset);
                controller.enqueue(repeated);
            },
            cancel,
        });

        await expect(inspectSafeMediaBody(body)).rejects.toBeInstanceOf(UnsupportedMediaContentError);
        expect(cancel).toHaveBeenCalled();
    });
});

function stream(bytes: Uint8Array) {
    return new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(bytes);
            controller.close();
        },
    });
}

function pngBytes() {
    return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
}

function jpegBytes() {
    return new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0, 0x43, 0, 1, 2, 3, 0xff, 0xd9]);
}

function mp4Bytes() {
    return new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 2, 0, 0x69, 0x73, 0x6f, 0x6d, 0x6d, 0x70, 0x34, 0x31]);
}

function mp3Bytes() {
    return new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0, 0, 0, 0, 0]);
}
