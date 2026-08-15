import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    updateOwnAvatarStorageKey: vi.fn(),
    deleteUserLocalMediaAssets: vi.fn(),
    writePersistentMediaDataUrl: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({ updateOwnAvatarStorageKey: mocks.updateOwnAvatarStorageKey }));
vi.mock("@/lib/server/local-media-storage", () => ({ deleteUserLocalMediaAssets: mocks.deleteUserLocalMediaAssets }));
vi.mock("@/lib/server/reference-asset-store", () => ({ writePersistentMediaDataUrl: mocks.writePersistentMediaDataUrl }));

import { ProfileAvatarServiceError, replaceProfileAvatar } from "./profile-avatar-service";

describe("profile avatar service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.writePersistentMediaDataUrl.mockResolvedValue({ token: "permanent/2026/07/27/images/avatar.webp", bytes: 100, mimeType: "image/webp" });
        mocks.updateOwnAvatarStorageKey.mockResolvedValue({ user: { id: "user-one", avatarUrl: "/api/public/users/user-one/avatar" }, previousStorageKey: "permanent/2026/07/20/images/old.webp" });
        mocks.deleteUserLocalMediaAssets.mockResolvedValue({ deletedFiles: 1, deletedBytes: 100, blocked: [] });
    });

    it("normalizes uploaded images to a square WebP before persistence", async () => {
        const source = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#336699" } })
            .png()
            .toBuffer();

        const user = await replaceProfileAvatar("user-one", { bytes: source, mimeType: "image/png", originalName: "portrait.png" });
        const dataUrl = mocks.writePersistentMediaDataUrl.mock.calls[0]?.[0] as string;
        const output = Buffer.from(dataUrl.split(",")[1], "base64");

        await expect(sharp(output).metadata()).resolves.toMatchObject({ format: "webp", width: 512, height: 512 });
        expect(mocks.writePersistentMediaDataUrl).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/webp;base64,/), "image", expect.objectContaining({ ownerUserId: "user-one", source: "profile-avatar", originalName: "portrait.webp" }));
        expect(mocks.updateOwnAvatarStorageKey).toHaveBeenCalledWith("user-one", "permanent/2026/07/27/images/avatar.webp");
        expect(mocks.deleteUserLocalMediaAssets).toHaveBeenCalledWith("user-one", ["permanent/2026/07/20/images/old.webp"]);
        expect(user).toMatchObject({ id: "user-one" });
    });

    it("rejects unsupported avatar formats before persistence", async () => {
        await expect(replaceProfileAvatar("user-one", { bytes: new Uint8Array([1]), mimeType: "image/gif" })).rejects.toEqual(expect.objectContaining<Partial<ProfileAvatarServiceError>>({ status: 400 }));
        expect(mocks.writePersistentMediaDataUrl).not.toHaveBeenCalled();
    });

    it("removes the newly written media when the profile update fails", async () => {
        mocks.updateOwnAvatarStorageKey.mockRejectedValueOnce(new Error("database failed"));
        const source = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#000000" } })
            .png()
            .toBuffer();

        await expect(replaceProfileAvatar("user-one", { bytes: source, mimeType: "image/png" })).rejects.toThrow("database failed");
        expect(mocks.deleteUserLocalMediaAssets).toHaveBeenCalledWith("user-one", ["permanent/2026/07/27/images/avatar.webp"]);
    });
});
