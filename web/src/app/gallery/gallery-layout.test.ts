import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("gallery surfaces", () => {
    it("keeps the public and workspace routes on one shared gallery view", async () => {
        const [publicPage, communityPage, sharedView, galleryCard, masonryGrid, themeToggle, publishLink, lazyImage] = await Promise.all([
            readFile(resolve(process.cwd(), "src/app/gallery/page.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/app/(user)/community/page.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/app/gallery/gallery-view.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/components/works/public-work-gallery-card.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/components/works/responsive-masonry-grid.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/app/gallery/gallery-theme-toggle.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/app/gallery/gallery-publish-link.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/components/media/lazy-media-image.tsx"), "utf8"),
        ]);

        expect(publicPage).toContain('basePath="/gallery"');
        expect(publicPage).toContain("<GalleryView");
        expect(publicPage.match(/<GalleryPublishLink/g)).toHaveLength(1);
        expect(publicPage).not.toContain('href="/works"');
        expect(publicPage).not.toContain("WORK_CATEGORY_OPTIONS.map");
        expect(communityPage).toContain('basePath="/community" embedded');
        expect(communityPage).toContain("h-full min-h-0 overflow-y-auto");
        expect(sharedView).toContain("WORK_CATEGORY_OPTIONS.map");
        expect(sharedView).toContain("action={basePath}");
        expect(sharedView).toContain('aria-label="作品分类"');
        expect(sharedView).toContain("<ResponsiveMasonryGrid");
        expect(sharedView).toContain("grid-cols-2");
        expect(sharedView).toContain("sm:grid-cols-3");
        expect(sharedView).toContain("md:grid-cols-4");
        expect(sharedView).toContain("lg:grid-cols-5");
        expect(sharedView).toContain("2xl:grid-cols-6");
        expect(sharedView).not.toContain("columns-2");
        expect(masonryGrid).toContain("Children.map");
        expect(masonryGrid).toContain("ResizeObserver");
        expect(masonryGrid).toContain("gridRowEnd");
        expect(sharedView).not.toContain("max-h-[640px]");
        expect(sharedView).toContain("galleryFilterHref(basePath");
        expect(sharedView).toContain("发布第一个作品");
        expect(sharedView).not.toContain('<span className="hidden sm:inline">发布作品</span>');
        expect(publishLink).toContain("state.ready");
        expect(publishLink).toContain("state.payload?.user");
        expect(publishLink).toContain('href="/works"');
        expect(galleryCard).toContain("<video");
        expect(sharedView).not.toContain("item.publicPrompt || item.description");
        expect(sharedView).not.toContain("item.tags.slice");
        expect(sharedView).toContain("<PublicWorkPreviewModal");
        expect(galleryCard).toContain("<PublicWorkLikeButton");
        expect(galleryCard).toContain("<LazyMediaImage");
        expect(galleryCard).toContain("<PublicWorkCardTitle");
        expect(galleryCard).toContain('aria-haspopup="dialog"');
        expect(galleryCard).toContain("<article");
        expect(sharedView).not.toContain("Bookmark");
        expect(sharedView).not.toContain("MessageCircle");
        expect(sharedView).not.toContain("<Heart");
        expect(sharedView).not.toContain("/share/${encodeURIComponent(item.slug)}");
        expect(themeToggle).toContain("!items-center !justify-center");
        expect(themeToggle).toContain('theme === "dark" ? "" : "[&>svg]:translate-x-px"');
        expect(lazyImage).toContain('loading = "lazy"');
        expect(lazyImage).toContain("loading={loading}");
        expect(lazyImage).toContain('decoding="async"');
        expect(lazyImage).toContain('status === "error"');
        expect(lazyImage).toContain("图片不可用");
        expect(lazyImage).toContain("<SiteLogo");
        expect(lazyImage).not.toContain("animate-pulse");
    });
});
