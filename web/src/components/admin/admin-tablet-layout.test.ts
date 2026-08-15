import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin tablet filter layouts", () => {
    it("keeps wide fixed-column filters above the tablet breakpoints", async () => {
        const [logs, operations, media] = await Promise.all([
            readFile(resolve(process.cwd(), "src/components/admin/admin-logs-section.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/app/admin/generation-operations/components/generation-operations-client.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/components/admin/admin-local-media-storage.tsx"), "utf8"),
        ]);

        expect(logs).toContain("2xl:grid-cols-[minmax(0,1fr)_286px]");
        expect(logs).toContain("xl:grid-cols-[minmax(220px,300px)_118px_138px_118px_minmax(132px,180px)]");
        expect(logs).not.toContain("sm:grid-cols-[minmax(220px,300px)");
        expect(operations).toContain("xl:grid-cols-[minmax(280px,1fr)_repeat(3,minmax(140px,180px))]");
        expect(operations).not.toContain("md:grid-cols-[minmax(280px,1fr)");
        expect(media).toContain("xl:grid-cols-[minmax(320px,1fr)_40px_200px_180px]");
        expect(media).not.toContain("md:grid-cols-[minmax(320px,1fr)_40px_200px_180px]");
    });
});
