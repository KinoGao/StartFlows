import { describe, expect, it } from "vitest";

import { emptyAdvancedConfig } from "@/lib/channel-protocol-registry";
import { resolveDeclarativeImageSize } from "./image-task-custom";

describe("declarative image request size", () => {
    it("uses a concrete square size for Stable Diffusion auto requests", () => {
        expect(resolveDeclarativeImageSize({ quality: "auto", size: "auto", advancedConfig: { ...emptyAdvancedConfig(), protocol: "stable-diffusion" } })).toBe("1024x1024");
    });

    it("preserves explicit dimensions and does not invent custom protocol defaults", () => {
        expect(resolveDeclarativeImageSize({ quality: "high", size: "1536x1024", advancedConfig: { ...emptyAdvancedConfig(), protocol: "stable-diffusion" } })).toBe("1536x1024");
        expect(resolveDeclarativeImageSize({ quality: "auto", size: "auto", advancedConfig: { ...emptyAdvancedConfig(), protocol: "custom" } })).toBe("");
    });
});
