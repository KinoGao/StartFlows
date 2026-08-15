import "server-only";

import { WORK_CATEGORY_OPTIONS } from "@/lib/work-publication-options";
import { listPublicGallery, WorkGovernanceServiceError } from "@/lib/server/work-governance-service";
import { listCommunityRanking, WorkCommunityServiceError } from "@/lib/server/work-community-service";

export type GalleryFilters = {
    keyword: string;
    category: string;
    tag: string;
    sort: string;
    featured: string;
    cursor: string;
};

export type GalleryItem = Awaited<ReturnType<typeof listPublicGallery>>["items"][number];
export type GalleryResult = { items: GalleryItem[]; nextCursor?: string; error: string };

export function parseGalleryFilters(params: Record<string, string | string[] | undefined>): GalleryFilters {
    return {
        keyword: first(params.keyword),
        category: galleryCategory(first(params.category)),
        tag: first(params.tag),
        sort: gallerySort(first(params.sort)),
        featured: first(params.featured) === "1" ? "1" : "",
        cursor: first(params.cursor),
    };
}

export async function loadGallery(filters: GalleryFilters): Promise<GalleryResult> {
    try {
        if (filters.sort === "weekly" || filters.sort === "monthly") {
            const ranking = await listCommunityRanking({ window: filters.sort, limit: 12, cursor: filters.cursor });
            return { items: ranking.items as GalleryItem[], nextCursor: ranking.nextCursor, error: "" };
        }
        return { ...(await listPublicGallery({ ...filters, limit: 12 })), error: "" };
    } catch (error) {
        return { items: [], error: error instanceof WorkGovernanceServiceError || error instanceof WorkCommunityServiceError ? error.message : "请稍后重试" };
    }
}

function first(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] || "" : value || "";
}

function galleryCategory(value: string) {
    return WORK_CATEGORY_OPTIONS.some((option) => option.value === value) ? value : "";
}

function gallerySort(value: string) {
    return ["random", "featured", "latest", "popular", "weekly", "monthly"].includes(value) ? value : "random";
}
