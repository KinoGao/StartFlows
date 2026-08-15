import { describe, expect, it } from "vitest";

import { imagePresetSize } from "./image-settings-panel";

describe("image settings preset dimensions", () => {
    it("stores the exact dimensions displayed by the size inputs", () => {
        expect(imagePresetSize("1:1")).toBe("1024x1024");
        expect(imagePresetSize("16:9")).toBe("1824x1024");
        expect(imagePresetSize("9:16")).toBe("1024x1824");
        expect(imagePresetSize("16:9-2k")).toBe("2048x1152");
        expect(imagePresetSize("auto")).toBe("auto");
    });
});
