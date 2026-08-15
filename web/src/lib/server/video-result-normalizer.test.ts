import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    downloadMediaToFile: vi.fn(),
    writeReferenceMediaFile: vi.fn(),
}));

vi.mock("@/lib/server/media-download", () => ({ downloadMediaToFile: mocks.downloadMediaToFile }));
vi.mock("@/lib/server/reference-asset-store", () => ({ writeReferenceMediaFile: mocks.writeReferenceMediaFile }));

import { normalizeVideoResult } from "./video-result-normalizer";

describe("normalizeVideoResult", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.downloadMediaToFile.mockResolvedValue({ bytes: 1024, mimeType: "video/mp4" });
        mocks.writeReferenceMediaFile.mockResolvedValue({ token: "permanent/2026/07/19/videos/result.mp4", mimeType: "video/mp4", bytes: 512 });
    });

    it("stores the upstream result unchanged and records the duration sent to the provider", async () => {
        const result = await normalizeVideoResult({ url: "/api/ai/system/video/_media?url=result", origin: "http://localhost", cookie: "session=test", requestedDurationSeconds: 5, ownerUserId: "user" });

        expect(mocks.writeReferenceMediaFile.mock.calls[0][0]).toMatch(/source-video$/);
        expect(result).toEqual({ url: "/api/reference-assets/permanent/2026/07/19/videos/result.mp4", mimeType: "video/mp4", durationMs: 5000 });
    });

    it("keeps the upstream media type without re-encoding", async () => {
        mocks.downloadMediaToFile.mockResolvedValue({ bytes: 1024, mimeType: "video/webm" });

        const result = await normalizeVideoResult({ url: "/api/source.mp4", origin: "http://localhost", requestedDurationSeconds: 5, ownerUserId: "user" });

        expect(mocks.writeReferenceMediaFile.mock.calls[0][0]).toMatch(/source-video$/);
        expect(mocks.writeReferenceMediaFile).toHaveBeenCalledWith(expect.any(String), "video", "video/webm", true, expect.objectContaining({ ownerUserId: "user", source: "video-task" }));
        expect(result.durationMs).toBe(5000);
    });

    it("omits duration metadata when the provider selects the duration", async () => {
        const result = await normalizeVideoResult({ url: "/api/source.mp4", origin: "http://localhost", ownerUserId: "user" });

        expect(result).not.toHaveProperty("durationMs");
        expect(mocks.writeReferenceMediaFile).toHaveBeenCalledOnce();
    });

    it("keeps long requested durations in stored metadata", async () => {
        const result = await normalizeVideoResult({ url: "/api/source.mp4", origin: "http://localhost", requestedDurationSeconds: 60, ownerUserId: "user" });

        expect(result.durationMs).toBe(60_000);
    });
});
