import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("global scroll surfaces", () => {
    it("hides browser scrollbars without disabling scrolling", async () => {
        const css = await readFile(resolve(process.cwd(), "src/app/styles/global-scroll-utilities.css"), "utf8");

        expect(css).toContain(":where(*)");
        expect(css).toContain("scrollbar-width: none !important");
        expect(css).toContain(":where(*)::-webkit-scrollbar");
        expect(css).not.toMatch(/:where\(\*\)\s*\{[^}]*overflow\s*:/s);
    });
});
