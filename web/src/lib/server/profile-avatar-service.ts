import sharp from "sharp";

import { updateOwnAvatarStorageKey } from "@/lib/auth/store";
import { deleteUserLocalMediaAssets } from "@/lib/server/local-media-storage";
import { writePersistentMediaDataUrl } from "@/lib/server/reference-asset-store";

const MAX_AVATAR_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_AVATAR_INPUT_PIXELS = 25_000_000;

export class ProfileAvatarServiceError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
        this.name = "ProfileAvatarServiceError";
    }
}

export async function replaceProfileAvatar(userId: string, input: { bytes: Uint8Array; mimeType: string; originalName?: string }) {
    if (!/^image\/(?:png|jpe?g|webp)$/i.test(input.mimeType)) throw new ProfileAvatarServiceError("仅支持 PNG、JPG 或 WebP 头像");
    if (!input.bytes.length) throw new ProfileAvatarServiceError("头像文件不能为空");
    if (input.bytes.length > MAX_AVATAR_UPLOAD_BYTES) throw new ProfileAvatarServiceError("头像文件不能超过 5MB", 413);

    let webp: Buffer;
    try {
        webp = await sharp(input.bytes, { failOn: "error", limitInputPixels: MAX_AVATAR_INPUT_PIXELS }).rotate().resize(512, 512, { fit: "cover", position: "attention" }).webp({ quality: 84, effort: 4 }).toBuffer();
    } catch {
        throw new ProfileAvatarServiceError("头像图片无法读取或尺寸过大");
    }

    const stored = await writePersistentMediaDataUrl(`data:image/webp;base64,${webp.toString("base64")}`, "image", {
        ownerUserId: userId,
        source: "profile-avatar",
        originalName: avatarFileName(input.originalName),
        maxBytes: 2 * 1024 * 1024,
    });

    try {
        const result = await updateOwnAvatarStorageKey(userId, stored.token);
        if (result.previousStorageKey && result.previousStorageKey !== stored.token) await deleteUserLocalMediaAssets(userId, [result.previousStorageKey]).catch(() => undefined);
        return result.user;
    } catch (error) {
        await deleteUserLocalMediaAssets(userId, [stored.token]).catch(() => undefined);
        throw error;
    }
}

function avatarFileName(value?: string) {
    const base =
        (value || "avatar")
            .trim()
            .replace(/^.*[\\/]/, "")
            .replace(/\.[^.]+$/, "")
            .slice(0, 240) || "avatar";
    return `${base}.webp`;
}
