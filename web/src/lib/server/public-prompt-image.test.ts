import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchSafeOutbound: vi.fn() }));

vi.mock("@/lib/server/safe-outbound-fetch", () => ({ fetchSafeOutbound: mocks.fetchSafeOutbound }));
vi.mock("@/lib/server/media-image-variant-cache", () => ({
    getOrCreateCachedImageVariant: vi.fn(async (_key: string, factory: () => Promise<Buffer>) => factory()),
}));

import { createPublicPromptImage, normalizePublicPromptImagePath } from "./public-prompt-image";

describe("public prompt images", () => {
    afterEach(() => {
        mocks.fetchSafeOutbound.mockReset();
        vi.unstubAllGlobals();
    });

    it("only accepts image paths inside a known upstream case directory", () => {
        expect(normalizePublicPromptImagePath("images/portrait_case1/output.jpg")).toBe("images/portrait_case1/output.jpg");
        expect(normalizePublicPromptImagePath("images/portrait_case323/323391.jpeg")).toBe("images/portrait_case323/323391.jpeg");
        expect(normalizePublicPromptImagePath("../LICENSE")).toBe("");
        expect(normalizePublicPromptImagePath("images/portrait_case1/../../LICENSE")).toBe("");
    });

    it("returns a bounded WebP variant", async () => {
        const source = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#365f8d" } })
            .jpeg()
            .toBuffer();
        mocks.fetchSafeOutbound.mockResolvedValue(new Response(new Uint8Array(source), { headers: { "content-type": "image/jpeg", "content-length": String(source.byteLength) } }));

        const output = await createPublicPromptImage("images/portrait_case11/output.jpg", "320");
        expect(mocks.fetchSafeOutbound).toHaveBeenCalledOnce();
        expect(output).not.toBeNull();
        if (!output) throw new Error("Expected a generated WebP image");
        await expect(sharp(output).metadata()).resolves.toMatchObject({ format: "webp", width: 320, height: 160 });
    });

    it("rejects oversized upstream responses before decoding", async () => {
        mocks.fetchSafeOutbound.mockResolvedValue(new Response(new Uint8Array([1]), { headers: { "content-type": "image/jpeg", "content-length": String(25 * 1024 * 1024) } }));
        await expect(createPublicPromptImage("images/portrait_case12/output.jpg", "640")).rejects.toThrow("超过大小限制");
    });
});
