import { afterEach, describe, expect, it, vi } from "vitest";

import { limitMediaResponseBody, MAX_MEDIA_PROXY_RANGE_BYTES, normalizeMediaProxyRange } from "./media-response-limit";

afterEach(() => vi.useRealTimers());

describe("normalizeMediaProxyRange", () => {
    it("keeps normal single ranges and bounds open or oversized ranges", () => {
        expect(normalizeMediaProxyRange("bytes=2-5")).toBe("bytes=2-5");
        expect(normalizeMediaProxyRange("bytes=100-")).toBe(`bytes=100-${100 + MAX_MEDIA_PROXY_RANGE_BYTES - 1}`);
        expect(normalizeMediaProxyRange("bytes=0-999999999")).toBe(`bytes=0-${MAX_MEDIA_PROXY_RANGE_BYTES - 1}`);
        expect(normalizeMediaProxyRange("bytes=-999999999")).toBe(`bytes=-${MAX_MEDIA_PROXY_RANGE_BYTES}`);
    });

    it("rejects multiple, empty, reversed and unsafe ranges", () => {
        expect(normalizeMediaProxyRange("bytes=0-1,4-5")).toBe("invalid");
        expect(normalizeMediaProxyRange("bytes=-")).toBe("invalid");
        expect(normalizeMediaProxyRange("bytes=5-2")).toBe("invalid");
        expect(normalizeMediaProxyRange("bytes=999999999999999999999-")).toBe("invalid");
    });
});

describe("limitMediaResponseBody", () => {
    it("cancels a stream that grows beyond the byte limit", async () => {
        const cancel = vi.fn();
        const body = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array([1, 2, 3]));
            },
            cancel,
        });

        await expect(new Response(limitMediaResponseBody(body, 2)).arrayBuffer()).rejects.toThrow("Media is too large");
        expect(cancel).toHaveBeenCalledWith("Media is too large");
    });

    it("cancels a stalled response body when the download timeout expires", async () => {
        vi.useFakeTimers();
        const cancel = vi.fn();
        const body = new ReadableStream<Uint8Array>({ cancel });
        const read = limitMediaResponseBody(body, 1024, 100)?.getReader().read();
        const rejected = expect(read).rejects.toThrow("Media download timed out");

        await vi.advanceTimersByTimeAsync(100);

        await rejected;
        expect(cancel).toHaveBeenCalledWith("Media download timed out");
    });
});
