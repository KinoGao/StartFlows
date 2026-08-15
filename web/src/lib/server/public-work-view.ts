import type { PublishedGalleryItemRecord } from "@/lib/server/database";
import { userAvatarUrl } from "@/lib/user-avatar";

export function publicGalleryItem(item: PublishedGalleryItemRecord) {
    const profileAuthor = item.authorDisplay === "profile";
    return {
        slug: item.slug,
        sourceType: item.sourceType,
        viewCount: item.viewCount,
        likeCount: item.likeCount,
        isFeatured: item.isFeatured,
        publishedAt: item.publishedAt,
        title: item.title,
        description: item.description,
        publicPrompt: item.publicPrompt,
        category: item.category,
        tags: item.tags,
        authorName: item.authorDisplay === "hidden" ? undefined : item.authorName,
        authorUsername: profileAuthor ? item.authorUsername : undefined,
        authorAvatarUrl: profileAuthor && item.authorUsername && item.authorAvatarStorageKey ? userAvatarUrl(item.authorUsername, item.authorAvatarUpdatedAt) : undefined,
        preview:
            item.assetId && item.assetMediaType
                ? {
                      id: item.assetId,
                      mediaType: item.assetMediaType,
                      mimeType: item.assetMimeType || "",
                      url: `/api/public/works/${encodeURIComponent(item.slug)}/media/${encodeURIComponent(item.assetId)}`,
                  }
                : undefined,
    };
}
