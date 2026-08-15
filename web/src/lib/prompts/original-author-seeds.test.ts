import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

type PromptSeed = {
    id: string;
    title: string;
    coverUrl: string;
    prompt: string;
};

describe("public prompt seeds", () => {
    it("keeps the pinned upstream collection complete and usable", async () => {
        const seeds = await readPromptSeeds();

        expect(seeds).toHaveLength(963);
        expect(new Set(seeds.map((seed) => seed.id)).size).toBe(seeds.length);
        expect(seeds.filter((seed) => !seed.title.trim() || !seed.coverUrl.trim() || !seed.prompt.trim())).toEqual([]);
    });

    it("does not expose JSON, templates, escapes, or code fences as prompt text", async () => {
        const seeds = await readPromptSeeds();
        const rawCode = /\{argument\b|```|~~~|(?:^|\n)\s*["'][^"'\r\n]+["']\s*:\s*/i;

        expect(seeds.filter((seed) => rawCode.test(seed.prompt)).map((seed) => seed.id)).toEqual([]);
        expect(seeds.filter((seed) => /\\["']/.test(seed.prompt)).map((seed) => seed.id)).toEqual([]);
    });
});

async function readPromptSeeds() {
    return JSON.parse(await readFile(resolve(process.cwd(), "src/lib/prompts/original-author-seeds.json"), "utf8")) as PromptSeed[];
}
