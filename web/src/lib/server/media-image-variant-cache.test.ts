import { describe, expect, it, vi } from "vitest";

import { getOrCreateCachedImageVariant, runImageVariantTaskOnce } from "./media-image-variant-cache";

describe("media image variant cache", () => {
    it("reuses cached buffers and merges concurrent transforms", async () => {
        const create = vi.fn(async () => Buffer.from("preview"));

        const [first, second] = await Promise.all([getOrCreateCachedImageVariant("test-buffer", create), getOrCreateCachedImageVariant("test-buffer", create)]);
        const third = await getOrCreateCachedImageVariant("test-buffer", create);

        expect(create).toHaveBeenCalledTimes(1);
        expect(first).toBe(second);
        expect(third).toBe(first);
    });

    it("merges concurrent object preview tasks but allows a later retry", async () => {
        const task = vi.fn(async () => undefined);

        await Promise.all([runImageVariantTaskOnce("test-object", task), runImageVariantTaskOnce("test-object", task)]);
        await runImageVariantTaskOnce("test-object", task);

        expect(task).toHaveBeenCalledTimes(2);
    });
});
