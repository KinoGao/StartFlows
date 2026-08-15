import { afterEach, describe, expect, it, vi } from "vitest";

import { readStoredMediaFile } from "./file-storage";

describe("file storage", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("extracts the storage key from an existing generation video", async () => {
        vi.stubGlobal("document", {
            createElement: () => ({
                videoWidth: 1920,
                videoHeight: 1080,
                duration: 4,
                onloadedmetadata: null as (() => void) | null,
                onerror: null as (() => void) | null,
                set src(_value: string) {
                    this.onloadedmetadata?.();
                },
            }),
        });

        await expect(readStoredMediaFile("/api/generation-log-assets/permanent/2026/07/27/videos/result.mp4?download=original", "video", "video/mp4")).resolves.toEqual({
            url: "/api/generation-log-assets/permanent/2026/07/27/videos/result.mp4",
            serverUrl: "/api/generation-log-assets/permanent/2026/07/27/videos/result.mp4",
            storageKey: "permanent/2026/07/27/videos/result.mp4",
            bytes: 0,
            mimeType: "video/mp4",
            width: 1920,
            height: 1080,
            durationMs: 4000,
        });
    });
});
