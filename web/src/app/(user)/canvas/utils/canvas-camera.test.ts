import { describe, expect, it } from "vitest";

import { applyCameraPrompt, cameraControlSummary, DEFAULT_CAMERA_CONTROL } from "./canvas-camera";

describe("canvas camera prompt", () => {
    it("keeps the prompt unchanged while camera control is disabled", () => {
        expect(applyCameraPrompt("一张产品海报", DEFAULT_CAMERA_CONTROL)).toBe("一张产品海报");
    });

    it("adds camera direction once and keeps retries idempotent", () => {
        const control = { ...DEFAULT_CAMERA_CONTROL, enabled: true, focalLength: 85, aperture: 2 };
        const first = applyCameraPrompt("一张产品海报", control);
        const second = applyCameraPrompt(first, control);

        expect(second).toBe(first);
        expect(first).toContain("85mm portrait perspective");
        expect(first).toContain("do not add a physical camera");
        expect(cameraControlSummary(control)).toContain("85mm · f/2");
    });
});
