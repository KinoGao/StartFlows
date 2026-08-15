import { describe, expect, it } from "vitest";

import { canvasToScreen, centerViewportOnRect } from "./leafer-viewport";

describe("centerViewportOnRect", () => {
    it("将节点中心定位到容器中心", () => {
        const viewport = centerViewportOnRect({ x: 100, y: 200, width: 300, height: 180 }, { width: 1200, height: 800 }, 0.9);

        expect(canvasToScreen(250, 290, viewport)).toEqual({ x: 600, y: 400 });
    });

    it("限制定位时的缩放范围", () => {
        expect(centerViewportOnRect({ x: 0, y: 0, width: 100, height: 100 }, { width: 800, height: 600 }, 9).k).toBe(3);
    });
});
