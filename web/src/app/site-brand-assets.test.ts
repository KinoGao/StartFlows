import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { DEFAULT_SITE_SETTINGS } from "@/lib/auth/store";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

describe("default StartFlows brand assets", () => {
    it("uses the built-in StartFlows logo for every default brand entry", () => {
        expect(DEFAULT_SITE_SETTINGS.logoUrl).toBe("/logo.png");
        expect(DEFAULT_SITE_SETTINGS.iconUrl).toBe("/icon.png");
    });

    it("ships logo and browser icon as valid PNG assets", async () => {
        const [logo, icon] = await Promise.all([readFile(resolve(process.cwd(), "public/logo.png")), readFile(resolve(process.cwd(), "public/icon.png"))]);

        expect(logo.subarray(0, 4).equals(PNG_MAGIC)).toBe(true);
        expect(icon.subarray(0, 4).equals(PNG_MAGIC)).toBe(true);
    });
});
