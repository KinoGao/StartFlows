import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("personal creator page layout", () => {
    it("centers the nickname independently and hides the username line", async () => {
        const page = await readFile(resolve(process.cwd(), "src/app/(user)/me/page.tsx"), "utf8");

        expect(page).toContain("grid-cols-[1.5rem_minmax(0,1fr)_1.5rem]");
        expect(page).toContain("sm:size-28");
        expect(page).toContain("sm:text-4xl");
        expect(page).toContain("size-6 -translate-y-1.5 shrink-0");
        expect(page).not.toContain("rounded-md border border-border bg-card text-muted-foreground");
        expect(page).toContain("<UserRoundPen");
        expect(page).not.toContain("@{user.username}");
        expect(page).not.toContain("items-center border-b border-border pb-5 pt-6 text-center");
        expect(page).toContain('aria-haspopup="dialog"');
        expect(page).toContain("<Input.TextArea");
        expect(page).toContain("maxLength={160}");
        expect(page).toContain("JSON.stringify({ displayName: draftDisplayName.trim(), bio: draftBio.trim() })");
        expect(page).toContain('setActivityView("likes")');
        expect(page).toContain('setActivityView("following")');
        expect(page).toContain('setActivityView("followers")');
        expect(page).toContain("<CommunityActivityModal");
        expect(page).toContain("mt-6 !h-10 !min-w-48");
    });

    it("shows the account id under the nickname", async () => {
        const actions = await readFile(resolve(process.cwd(), "src/components/layout/user-status-actions.tsx"), "utf8");

        expect(actions).toContain("ID：${user.accountId}");
        expect(actions).not.toContain("VOZEB 创作账户");
    });
});
