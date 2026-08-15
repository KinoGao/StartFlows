import { describe, expect, it } from "vitest";

import { canvasThemes } from "./canvas-theme";

describe("canvas theme backgrounds", () => {
    it("uses a white light workspace and a dark workspace", () => {
        expect(canvasThemes.light.canvas.background).toBe("#ffffff");
        expect(canvasThemes.light.canvas.backdrop).toBe("#ffffff");
        expect(canvasThemes.dark.canvas.background).toBe("#090b10");
        expect(canvasThemes.dark.canvas.backdrop).toBe("#090b10");
    });

    it("keeps the established cool blue-gray canvas palette", () => {
        expect(canvasThemes.light.node.fill).toBe("#eef6fb");
        expect(canvasThemes.light.node.stroke).toBe("#d9e7ee");
        expect(canvasThemes.light.toolbar.itemHover).toBe("#eef6fb");
        expect(canvasThemes.light.node.activeStroke).toBe("#0f172a");
        expect(canvasThemes.dark.node.fill).toBe("#111318");
        expect(canvasThemes.dark.node.activeStroke).toBe("#ffffff");
    });
});
