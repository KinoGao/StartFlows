import type { Metadata } from "next";

import { loadGallery, parseGalleryFilters } from "@/app/gallery/gallery-data";
import { GalleryView } from "@/app/gallery/gallery-view";

type CommunitySearchParams = Promise<Record<string, string | string[] | undefined>>;

export const metadata: Metadata = {
    title: "作品广场",
    robots: { index: false, follow: false },
};

export default async function CommunityPage({ searchParams }: { searchParams: CommunitySearchParams }) {
    const filters = parseGalleryFilters(await searchParams);
    const gallery = await loadGallery(filters);
    return (
        <main className="h-full min-h-0 overflow-y-auto bg-background text-foreground">
            <GalleryView filters={filters} gallery={gallery} basePath="/community" embedded />
        </main>
    );
}
