import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("personal homepage community activity", () => {
    it("keeps relationship management on the personal homepage and removes the duplicate profile section", async () => {
        const [activityModal, mePage, elements, profilePage] = await Promise.all([
            readFile(resolve(process.cwd(), "src/app/(user)/me/community-activity-modal.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/app/(user)/me/page.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/app/(user)/profile/profile-elements.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/app/(user)/profile/page.tsx"), "utf8"),
        ]);

        expect(activityModal).toContain("<Modal");
        expect(activityModal).not.toContain("<Drawer");
        expect(activityModal).toContain("setPublicCreatorFollow(item.username, false)");
        expect(activityModal).toContain("setWorkLike(item.slug, false)");
        expect(activityModal).toContain("setPublicUserBlock(item.username, true)");
        expect(activityModal).toContain("publicProfileAvailable");
        expect(activityModal).not.toContain("我的收藏");
        expect(activityModal).not.toContain("我的评论");
        expect(mePage).toContain("<CommunityActivityModal");
        expect(elements).not.toContain('label: "社区与主页"');
        expect(profilePage).not.toContain("ProfileCommunitySection");
    });
});
