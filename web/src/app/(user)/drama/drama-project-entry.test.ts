import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("drama project entry", () => {
    it("keeps the create modal compact and separates labels from Ant Design controls", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama/page.tsx"), "utf8");

        expect(source).toContain("width={520}");
        expect(source).toContain('maxWidth: "calc(100vw - 24px)"');
        expect(source).toContain('htmlFor="drama-project-title"');
        expect(source).toContain('<div className="min-w-0">');
        expect(source).not.toContain('<label className="block space-y-2.5">');
    });

    it("uses a whole-card project link while keeping publish and delete as independent actions", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama/components/drama-project-card.tsx"), "utf8");

        expect(source).toContain("href={`/drama/${project.id}`}");
        expect(source).toContain("aria-label={`进入短剧项目：${project.title}`}");
        expect(source).toContain('aria-label="删除项目"');
        expect(source).toContain("sourceType=drama");
        expect(source).not.toContain("继续制作");
    });
});
