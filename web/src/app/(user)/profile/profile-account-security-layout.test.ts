import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("profile account security layout", () => {
    it("keeps personal fields separate from email security", async () => {
        const [page, elements] = await Promise.all([readFile(resolve(process.cwd(), "src/app/(user)/profile/page.tsx"), "utf8"), readFile(resolve(process.cwd(), "src/app/(user)/profile/profile-elements.tsx"), "utf8")]);

        expect(elements).toContain('label: "账户与安全"');
        expect(page).toContain('<AccountPanel title="账户与安全"');
        expect(page).toContain("<AccountEmailForm");
        expect(page).toContain("body: JSON.stringify({ displayName, bio })");
        expect(page).toContain("body: JSON.stringify({ email, emailCode })");
        expect(elements).toContain("export function AccountEmailForm");
    });
});
