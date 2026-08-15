import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Canvas panorama interaction boundary", () => {
    it("keeps the node preview draggable while isolating the portal viewer", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/canvas/components/canvas-panorama-viewer.tsx"), "utf8");

        expect(source).toContain('<div className="relative h-full w-full overflow-hidden" data-canvas-no-zoom>');
        expect(source).toContain('className="contents"');
        expect(source).toContain("onMouseDown={stopCanvasInteraction}");
        expect(source).toContain("onPointerDown={stopCanvasInteraction}");
        expect(source).toContain("mask={{ closable: false }}");
    });
});
