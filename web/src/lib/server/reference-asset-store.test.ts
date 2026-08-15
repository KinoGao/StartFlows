import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    cleanupExpired: vi.fn(),
    getRegistration: vi.fn(),
    stat: vi.fn(),
    unlink: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
    copyFile: vi.fn(),
    mkdir: vi.fn(),
    stat: mocks.stat,
    unlink: mocks.unlink,
    writeFile: vi.fn(),
}));
vi.mock("@/lib/server/local-media-registry", () => ({
    getLocalMediaRegistration: mocks.getRegistration,
    registerLocalMediaAsset: vi.fn(),
}));
vi.mock("@/lib/server/local-media-storage", () => ({
    cleanupExpiredLocalMediaAssets: mocks.cleanupExpired,
    createDatedMediaPath: vi.fn(() => "temporary/2026/01/01/images/file.png"),
    REFERENCE_MEDIA_ROOT: "C:\\tmp\\reference-assets",
}));

import { readReferenceAsset, writeReferenceMediaDataUrl } from "./reference-asset-store";

describe("reference asset lifecycle boundaries", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("does not run media cleanup from the online write path", async () => {
        await expect(writeReferenceMediaDataUrl("invalid", "image", { ownerUserId: "user-one", source: "test" })).rejects.toThrow("参考素材格式不正确");
        expect(mocks.cleanupExpired).not.toHaveBeenCalled();
    });

    it("leaves expired temporary files for reference-aware maintenance", async () => {
        const registration = { storageKey: "temporary/2026/01/01/images/20260101-000000-00000000-0000-4000-8000-000000000000.png" };
        mocks.stat.mockResolvedValue({ size: 12, mtimeMs: 0 });
        mocks.getRegistration.mockResolvedValue(registration);

        await expect(readReferenceAsset(registration.storageKey)).resolves.toMatchObject({ size: 12, registration });
        expect(mocks.unlink).not.toHaveBeenCalled();
    });
});
