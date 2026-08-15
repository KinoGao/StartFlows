import type {
    CommunityUserRecord,
    FollowedUserRecord,
    LikedPublishedWorkRecord,
    PublicCreatorProfileRecord,
    PublishedWorkRankingRecord,
    UserCommunitySummaryRecord,
    UserBlockResultRecord,
    UserFollowResultRecord,
    UserNotificationRecord,
    WorkCommunityRelationResultRecord,
    WorkCommunitySummaryRecord,
} from "./repository-types";
import { mapPublishedGalleryItem } from "./repository-work-publication-mappers";
import { isoValue, numberValue, optionalIso, optionalString, stringValue } from "./repository-utils";

export function mapWorkCommunitySummary(row: Record<string, unknown>): WorkCommunitySummaryRecord {
    const authorDisplay = row.author_display;
    return {
        workId: stringValue(row.work_id),
        versionId: stringValue(row.version_id),
        slug: stringValue(row.slug),
        ownerUserId: stringValue(row.owner_user_id),
        authorDisplay: authorDisplay === "custom" || authorDisplay === "hidden" ? authorDisplay : "profile",
        likeCount: numberValue(row.like_count),
        followerCount: numberValue(row.follower_count),
        liked: row.liked === true,
        followingAuthor: row.following_author === true,
        canFollow: row.can_follow === true,
    };
}

export function mapWorkCommunityRelationResult(row: Record<string, unknown>): WorkCommunityRelationResultRecord {
    return {
        workId: stringValue(row.work_id),
        versionId: stringValue(row.version_id),
        ownerUserId: stringValue(row.owner_user_id),
        changed: row.changed === true,
        active: row.active === true,
        likeCount: numberValue(row.like_count),
    };
}

export function mapUserFollowResult(row: Record<string, unknown>): UserFollowResultRecord {
    return {
        followedUserId: stringValue(row.followed_user_id),
        changed: row.changed === true,
        active: row.active === true,
        followerCount: numberValue(row.follower_count),
    };
}

export function mapUserBlockResult(row: Record<string, unknown>): UserBlockResultRecord {
    return {
        blockedUserId: stringValue(row.blocked_user_id),
        changed: row.changed === true,
        active: row.active === true,
        removedFollowCount: numberValue(row.removed_follow_count),
    };
}

export function mapPublishedWorkRanking(row: Record<string, unknown>): PublishedWorkRankingRecord {
    return {
        ...mapPublishedGalleryItem(row),
        score: numberValue(row.score),
        windowLikeCount: numberValue(row.window_like_count),
    };
}

export function mapUserNotification(row: Record<string, unknown>): UserNotificationRecord {
    const notificationType = row.notification_type;
    return {
        id: stringValue(row.id),
        userId: stringValue(row.user_id),
        actorUserId: optionalString(row.actor_user_id),
        notificationType: notificationType === "user_follow" ? notificationType : "work_like",
        workId: optionalString(row.work_id),
        targetPath: stringValue(row.target_path),
        summary: stringValue(row.summary),
        dedupKey: stringValue(row.dedup_key),
        readAt: optionalIso(row.read_at),
        createdAt: isoValue(row.created_at),
        actorUsername: optionalString(row.actor_username),
        actorDisplayName: optionalString(row.actor_display_name),
    };
}

export function mapFollowedUser(row: Record<string, unknown>): FollowedUserRecord {
    return {
        userId: stringValue(row.user_id),
        username: stringValue(row.username),
        displayName: stringValue(row.display_name),
        bio: stringValue(row.bio),
        avatarStorageKey: optionalString(row.avatar_storage_key),
        avatarUpdatedAt: optionalIso(row.avatar_updated_at),
        followerCount: numberValue(row.follower_count),
        followedAt: isoValue(row.followed_at),
        publicProfileAvailable: row.public_profile_available === true,
    };
}

export function mapCommunityUser(row: Record<string, unknown>): CommunityUserRecord {
    const followed = mapFollowedUser({ ...row, followed_at: row.related_at });
    const { followedAt, ...user } = followed;
    return { ...user, relatedAt: followedAt };
}

export function mapLikedPublishedWork(row: Record<string, unknown>): LikedPublishedWorkRecord {
    return { ...mapPublishedGalleryItem(row), likedAt: isoValue(row.liked_at) };
}

export function mapUserCommunitySummary(row: Record<string, unknown>): UserCommunitySummaryRecord {
    const publishedWorkCount = numberValue(row.published_work_count);
    return {
        username: stringValue(row.username),
        publishedWorkCount,
        followingCount: numberValue(row.following_count),
        followerCount: numberValue(row.follower_count),
        likedWorkCount: numberValue(row.liked_work_count),
        publicProfileAvailable: publishedWorkCount > 0,
    };
}

export function mapPublicCreatorProfile(row: Record<string, unknown>): PublicCreatorProfileRecord {
    return {
        userId: stringValue(row.user_id),
        username: stringValue(row.username),
        displayName: stringValue(row.display_name),
        bio: stringValue(row.bio),
        avatarStorageKey: optionalString(row.avatar_storage_key),
        avatarUpdatedAt: optionalIso(row.avatar_updated_at),
        publishedWorkCount: numberValue(row.published_work_count),
        receivedLikeCount: numberValue(row.received_like_count),
        followerCount: numberValue(row.follower_count),
        followingCount: numberValue(row.following_count),
    };
}
