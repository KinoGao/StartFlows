import type { PublishedGalleryItemRecord, PublishedWorkAssetRecord, PublishedWorkCaseRecord, PublishedWorkCaseSummaryRecord, PublishedWorkRecord, PublishedWorkSummaryRecord, PublishedWorkVersionRecord } from "./repository-types";
import { formatAccountId } from "@/lib/account-id";
import { isoValue, jsonValue, numberValue, optionalIso, optionalString, stringValue } from "./repository-utils";

export function mapPublishedWork(row: Record<string, unknown>): PublishedWorkRecord {
    return {
        id: stringValue(row.id),
        ownerUserId: stringValue(row.owner_user_id),
        slug: stringValue(row.slug),
        sourceType: row.source_type === "canvas" || row.source_type === "drama" ? row.source_type : "media",
        sourceId: stringValue(row.source_id),
        lifecycleStatus: row.lifecycle_status === "revoked" ? "revoked" : "active",
        currentVersionId: optionalString(row.current_version_id),
        publishedVersionId: optionalString(row.published_version_id),
        isFeatured: Boolean(row.is_featured),
        featuredAt: optionalIso(row.featured_at),
        featuredByUserId: optionalString(row.featured_by_user_id),
        viewCount: numberValue(row.view_count),
        likeCount: numberValue(row.like_count),
        lastViewedAt: optionalIso(row.last_viewed_at),
        revokedAt: optionalIso(row.revoked_at),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
        ownerUsername: optionalString(row.owner_username),
        ownerDisplayName: optionalString(row.owner_display_name),
        ownerAccountId: row.owner_account_id === undefined || row.owner_account_id === null ? undefined : formatAccountId(row.owner_account_id),
        ownerAvatarStorageKey: optionalString(row.owner_avatar_storage_key),
        ownerAvatarUpdatedAt: optionalIso(row.owner_avatar_updated_at),
    };
}

export function mapPublishedWorkVersion(row: Record<string, unknown>, prefix = ""): PublishedWorkVersionRecord {
    const value = (name: string) => row[`${prefix}${name}`];
    const tags = jsonValue(value("tags"));
    const moderationStatus = value("moderation_status");
    const visibility = value("visibility");
    const authorDisplay = value("author_display");
    return {
        id: stringValue(value("id")),
        workId: stringValue(value("work_id")),
        versionNumber: numberValue(value("version_number")),
        title: stringValue(value("title")),
        description: stringValue(value("description")),
        publicPrompt: stringValue(value("public_prompt")),
        category: stringValue(value("category")),
        tags: Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [],
        visibility: visibility === "unlisted" || visibility === "public" ? visibility : "private",
        authorDisplay: authorDisplay === "custom" || authorDisplay === "hidden" ? authorDisplay : "profile",
        authorName: optionalString(value("author_name")),
        moderationStatus: moderationStatus === "pending" || moderationStatus === "approved" || moderationStatus === "rejected" || moderationStatus === "taken_down" ? moderationStatus : "draft",
        rejectionReason: optionalString(value("rejection_reason")),
        submittedAt: optionalIso(value("submitted_at")),
        reviewedAt: optionalIso(value("reviewed_at")),
        reviewedByUserId: optionalString(value("reviewed_by_user_id")),
        moderationProvider: optionalString(value("moderation_provider")),
        moderationSignal: value("moderation_signal") == null ? undefined : jsonValue(value("moderation_signal")),
        createdAt: isoValue(value("created_at")),
        updatedAt: isoValue(value("updated_at")),
    };
}

export function mapPublishedWorkAsset(row: Record<string, unknown>, prefix = ""): PublishedWorkAssetRecord {
    const value = (name: string) => row[`${prefix}${name}`];
    const mediaType = value("media_type");
    return {
        id: stringValue(value("id")),
        versionId: stringValue(value("version_id")),
        storageKey: stringValue(value("storage_key")),
        mediaType: mediaType === "video" || mediaType === "audio" ? mediaType : "image",
        mimeType: stringValue(value("mime_type")),
        role: value("role") === "cover" ? "cover" : "content",
        sortOrder: numberValue(value("sort_order")),
        metadata: jsonValue(value("metadata")),
        createdAt: isoValue(value("created_at")),
    };
}

export function mapPublishedWorkSummary(row: Record<string, unknown>): PublishedWorkSummaryRecord {
    return {
        ...mapPublishedWork(row),
        currentVersion: row.current_id ? mapPublishedWorkVersion(row, "current_") : undefined,
        publishedVersion: row.published_id ? mapPublishedWorkVersion(row, "published_") : undefined,
        currentPreview: row.current_preview_id ? mapPublishedWorkAsset(row, "current_preview_") : undefined,
    };
}

export function mapPublishedGalleryItem(row: Record<string, unknown>): PublishedGalleryItemRecord {
    const tags = jsonValue(row.tags);
    const mediaType = row.asset_media_type;
    return {
        workId: stringValue(row.work_id),
        versionId: stringValue(row.version_id),
        authorUserId: stringValue(row.author_user_id || row.owner_user_id),
        slug: stringValue(row.slug),
        sourceType: row.source_type === "canvas" || row.source_type === "drama" ? row.source_type : "media",
        viewCount: numberValue(row.view_count),
        likeCount: numberValue(row.like_count),
        isFeatured: Boolean(row.is_featured),
        featuredAt: optionalIso(row.featured_at),
        publishedAt: isoValue(row.published_at),
        title: stringValue(row.title),
        description: stringValue(row.description),
        publicPrompt: stringValue(row.public_prompt),
        category: stringValue(row.category),
        tags: Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [],
        authorDisplay: row.author_display === "custom" || row.author_display === "hidden" ? row.author_display : "profile",
        authorName: optionalString(row.author_name),
        authorUsername: optionalString(row.author_username),
        authorAvatarStorageKey: optionalString(row.owner_avatar_storage_key),
        authorAvatarUpdatedAt: optionalIso(row.owner_avatar_updated_at),
        assetId: optionalString(row.asset_id),
        assetMediaType: mediaType === "image" || mediaType === "video" || mediaType === "audio" ? mediaType : undefined,
        assetMimeType: optionalString(row.asset_mime_type),
    };
}

export function mapPublishedWorkCase(row: Record<string, unknown>): PublishedWorkCaseRecord {
    return {
        id: stringValue(row.id),
        workId: stringValue(row.work_id),
        versionId: stringValue(row.version_id),
        submitterUserId: stringValue(row.submitter_user_id),
        caseType: row.case_type === "appeal" ? "appeal" : "report",
        category: stringValue(row.category),
        description: stringValue(row.description),
        status: row.status === "approved" || row.status === "rejected" ? row.status : "open",
        resolution: optionalString(row.resolution),
        handledByUserId: optionalString(row.handled_by_user_id),
        handledAt: optionalIso(row.handled_at),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}

export function mapPublishedWorkCaseSummary(row: Record<string, unknown>): PublishedWorkCaseSummaryRecord {
    return {
        ...mapPublishedWorkCase(row),
        slug: stringValue(row.slug),
        title: stringValue(row.title),
        ownerUserId: stringValue(row.owner_user_id),
        ownerUsername: optionalString(row.owner_username),
        ownerDisplayName: optionalString(row.owner_display_name),
        ownerAccountId: row.owner_account_id === undefined || row.owner_account_id === null ? undefined : formatAccountId(row.owner_account_id),
        submitterUsername: optionalString(row.submitter_username),
        submitterDisplayName: optionalString(row.submitter_display_name),
        submitterAccountId: row.submitter_account_id === undefined || row.submitter_account_id === null ? undefined : formatAccountId(row.submitter_account_id),
    };
}
