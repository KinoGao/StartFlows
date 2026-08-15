import type { Metadata } from "next";
import Link from "next/link";

import { SiteLogo } from "@/components/layout/site-logo";
import { getPublicSiteSettings } from "@/lib/server/site-metadata";
import { loadGallery, parseGalleryFilters } from "./gallery-data";
import { GalleryPublishLink } from "./gallery-publish-link";
import { GalleryThemeToggle } from "./gallery-theme-toggle";
import { GalleryView } from "./gallery-view";

type GallerySearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
    const site = await getPublicSiteSettings();
    return {
        title: `作品广场 | ${site.title}`,
        description: "浏览社区公开发布并通过审核的图片、视频、画布与短剧作品。",
        alternates: { canonical: "/gallery" },
        robots: { index: true, follow: true },
    };
}

export default async function GalleryPage({ searchParams }: { searchParams: GallerySearchParams }) {
    const sitePromise = getPublicSiteSettings();
    const filters = parseGalleryFilters(await searchParams);
    const [site, gallery] = await Promise.all([sitePromise, loadGallery(filters)]);

    return (
        <main className="app-scroll-page bg-background text-foreground">
            <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur-xl">
                <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-3 sm:h-16 sm:px-6">
                    <Link href="/" className="flex min-w-0 items-center gap-2.5 text-foreground" aria-label={site.title}>
                        <SiteLogo logoUrl={site.logoUrl || "/logo.svg"} className="size-7 sm:size-8" />
                        <span className="truncate text-sm font-semibold sm:text-base">{site.title}</span>
                    </Link>
                    <div className="flex shrink-0 items-center gap-2">
                        <GalleryThemeToggle />
                        <GalleryPublishLink className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md !bg-foreground px-3 text-sm font-medium !text-background transition hover:opacity-80 sm:px-4" />
                    </div>
                </div>
            </header>

            <GalleryView filters={filters} gallery={gallery} basePath="/gallery" />
        </main>
    );
}
