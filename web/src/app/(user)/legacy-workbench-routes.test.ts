import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("legacy workbench routes", () => {
    it.each(["image", "video"])("hands /%s off to the unified creative Agent", async (route) => {
        const page = await readFile(resolve(process.cwd(), `src/app/(user)/${route}/page.tsx`), "utf8");

        expect(page).toContain('redirect("/create")');
        expect(page).not.toContain('"use client"');
        expect(page).not.toContain("Workbench");
    });
});
