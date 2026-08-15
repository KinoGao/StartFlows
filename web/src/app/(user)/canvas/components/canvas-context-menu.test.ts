import { describe, expect, it } from "vitest";

import { clampCanvasContextMenuPosition } from "./canvas-context-menu";

describe("Canvas context menu positioning", () => {
    it("keeps the measured menu inside every viewport edge", () => {
        expect(clampCanvasContextMenuPosition({ x: 390, y: 820 }, { width: 176, height: 84 }, { width: 390, height: 844 })).toEqual({ x: 206, y: 752 });
        expect(clampCanvasContextMenuPosition({ x: -20, y: -10 }, { width: 176, height: 84 }, { width: 390, height: 844 })).toEqual({ x: 8, y: 8 });
    });
});
