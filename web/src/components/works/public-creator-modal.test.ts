import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("public creator modal", () => {
    it("opens creators in place from the gallery, inspiration cards and work preview", async () => {
        const [modal, profile, card, gallery, inspiration, preview] = await Promise.all([
            readFile(resolve(process.cwd(), "src/components/works/public-creator-modal.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/components/works/public-creator-profile.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/components/works/public-work-gallery-card.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/app/gallery/gallery-view.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/app/(user)/create/components/create-inspiration-gallery.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/components/works/public-work-preview-modal.tsx"), "utf8"),
        ]);

        expect(modal).toContain("getPublicCreatorPage");
        expect(modal).toContain("<PublicCreatorProfile");
        expect(profile).not.toContain("@{profile.username}");
        expect(profile).not.toContain("items-center border-b border-border text-center");
        expect(card).toContain("onOpenAuthor");
        expect(gallery).toContain("<PublicCreatorModal");
        expect(inspiration).toContain("<PublicCreatorModal");
        expect(preview).toContain("onOpenCreator");
    });

    it("keeps private likes on the authenticated personal home only", async () => {
        const [personal, publicProfile] = await Promise.all([readFile(resolve(process.cwd(), "src/app/(user)/me/page.tsx"), "utf8"), readFile(resolve(process.cwd(), "src/components/works/public-creator-profile.tsx"), "utf8")]);

        expect(personal).toContain('type ProfileTab = "published" | "likes"');
        expect(personal).toContain('view: "likes"');
        expect(personal).toContain("我的喜欢");
        expect(publicProfile).not.toContain("我的喜欢");
        expect(publicProfile).not.toContain('view: "likes"');
    });

    it("keeps the public URL as an SSR share and metadata surface", async () => {
        const page = await readFile(resolve(process.cwd(), "src/app/u/[username]/page.tsx"), "utf8");

        expect(page).toContain("generateMetadata");
        expect(page).toContain('openGraph: { type: "profile"');
        expect(page).toContain("alternates: { canonical }");
        expect(page).toContain('loadCreatorPage(username, viewer?.id || "")');
        expect(page).not.toContain("profile.email");
    });
});
