import type { QueryExecutor } from "@/lib/server/database/postgres";
import type { CommunityUserRecord, FollowedUserRecord, LikedPublishedWorkRecord, PageInput, PageResult, PublicCreatorWorkCursor, PublishedWorkRankingRecord, UserNotificationRecord, WorkCommunityRankingCursor } from "./repository-shared";
import {
    mapCommunityUser,
    mapFollowedUser,
    mapLikedPublishedWork,
    mapPublicCreatorProfile,
    mapPublishedGalleryItem,
    mapPublishedWorkRanking,
    mapUserCommunitySummary,
    mapUserBlockResult,
    mapUserFollowResult,
    mapUserNotification,
    mapWorkCommunityRelationResult,
    mapWorkCommunitySummary,
    normalizePage,
    normalizePageSize,
    numberValue,
    pageResult,
} from "./repository-shared";

type NotificationCursor = { createdAt: string; id: string };

export class WorkCommunityRepository {
    constructor(private readonly db: QueryExecutor) {}

    async getSummary(slug: string, viewerUserId?: string) {
        const result = await this.db.query(
            `SELECT work.id AS work_id, work.published_version_id AS version_id, work.slug, work.owner_user_id,
                    version.author_display, work.like_count,
                    (SELECT count(*) FROM user_follows follow JOIN users follower ON follower.id = follow.follower_user_id AND follower.status = 'active' WHERE follow.followed_user_id = work.owner_user_id) AS follower_count,
                    EXISTS (SELECT 1 FROM published_work_likes relation WHERE relation.work_id = work.id AND relation.user_id = $2) AS liked,
                    EXISTS (SELECT 1 FROM user_follows follow WHERE follow.follower_user_id = $2 AND follow.followed_user_id = work.owner_user_id) AS following_author,
                    (version.author_display = 'profile' AND $2::text IS NOT NULL AND $2 <> work.owner_user_id
                     AND NOT EXISTS (
                        SELECT 1 FROM user_blocks blocked
                        WHERE (blocked.blocker_user_id = $2 AND blocked.blocked_user_id = work.owner_user_id)
                           OR (blocked.blocker_user_id = work.owner_user_id AND blocked.blocked_user_id = $2)
                     )) AS can_follow
             FROM published_works work
             JOIN published_work_versions version ON version.id = work.published_version_id
             JOIN users owner ON owner.id = work.owner_user_id AND owner.status = 'active'
             WHERE lower(work.slug) = lower($1)
               AND work.lifecycle_status = 'active'
               AND version.moderation_status = 'approved'
               AND version.visibility IN ('unlisted', 'public')`,
            [slug, viewerUserId || null],
        );
        return result.rows[0] ? mapWorkCommunitySummary(result.rows[0]) : null;
    }

    setLiked(slug: string, userId: string, active: boolean, changedAt: string) {
        return this.setLike(slug, userId, active, changedAt);
    }

    async setFollowingAuthor(slug: string, followerUserId: string, active: boolean, changedAt: string) {
        const activeParam = active ? "$4" : "$3";
        const changeSql = active
            ? `INSERT INTO user_follows (follower_user_id, followed_user_id, created_at)
               SELECT $2, target.followed_user_id, $3 FROM target
               ON CONFLICT DO NOTHING RETURNING followed_user_id`
            : `DELETE FROM user_follows relation USING target
               WHERE relation.follower_user_id = $2 AND relation.followed_user_id = target.followed_user_id
               RETURNING relation.followed_user_id`;
        const result = await this.db.query(
            `WITH target AS (
                SELECT work.owner_user_id AS followed_user_id
                FROM published_works work
                JOIN published_work_versions version ON version.id = work.published_version_id
                JOIN users owner ON owner.id = work.owner_user_id AND owner.status = 'active'
                JOIN users actor ON actor.id = $2 AND actor.status = 'active'
                WHERE lower(work.slug) = lower($1)
                  AND work.lifecycle_status = 'active'
                  AND version.moderation_status = 'approved'
                  AND version.visibility IN ('unlisted', 'public')
                  AND version.author_display = 'profile'
                  AND work.owner_user_id <> $2
                  AND (NOT ${activeParam}::boolean OR NOT EXISTS (
                      SELECT 1 FROM user_blocks blocked
                      WHERE (blocked.blocker_user_id = $2 AND blocked.blocked_user_id = work.owner_user_id)
                         OR (blocked.blocker_user_id = work.owner_user_id AND blocked.blocked_user_id = $2)
                  ))
             ), changed AS (
                ${changeSql}
             )
             SELECT target.followed_user_id,
                    EXISTS (SELECT 1 FROM changed) AS changed,
                    (${activeParam}::boolean AND (
                        EXISTS (SELECT 1 FROM changed)
                        OR EXISTS (SELECT 1 FROM user_follows relation WHERE relation.follower_user_id = $2 AND relation.followed_user_id = target.followed_user_id)
                    )) AS active,
                    (SELECT count(*) FROM user_follows relation JOIN users follower ON follower.id = relation.follower_user_id AND follower.status = 'active' WHERE relation.followed_user_id = target.followed_user_id) AS follower_count
             FROM target`,
            active ? [slug, followerUserId, changedAt, active] : [slug, followerUserId, active],
        );
        return result.rows[0] ? mapUserFollowResult(result.rows[0]) : null;
    }

    async setFollowingUser(username: string, followerUserId: string, active: boolean, changedAt: string) {
        const changeSql = active
            ? `INSERT INTO user_follows (follower_user_id, followed_user_id, created_at)
               SELECT $2, target.followed_user_id, $4 FROM target
               ON CONFLICT DO NOTHING RETURNING followed_user_id`
            : `DELETE FROM user_follows relation USING target
               WHERE relation.follower_user_id = $2 AND relation.followed_user_id = target.followed_user_id
               RETURNING relation.followed_user_id`;
        const result = await this.db.query(
            `WITH target AS (
                SELECT followed.id AS followed_user_id
                FROM users followed
                JOIN users actor ON actor.id = $2 AND actor.status = 'active'
                WHERE lower(followed.username) = lower($1)
                   AND followed.id <> $2
                   AND (NOT $3::boolean OR NOT EXISTS (
                       SELECT 1 FROM user_blocks blocked
                       WHERE (blocked.blocker_user_id = $2 AND blocked.blocked_user_id = followed.id)
                          OR (blocked.blocker_user_id = followed.id AND blocked.blocked_user_id = $2)
                   ))
                   AND (NOT $3::boolean OR (
                      followed.status = 'active'
                      AND EXISTS (
                          SELECT 1 FROM published_works work
                          JOIN published_work_versions version ON version.id = work.published_version_id
                          WHERE work.owner_user_id = followed.id
                            AND work.lifecycle_status = 'active'
                            AND version.moderation_status = 'approved'
                            AND version.visibility = 'public'
                            AND version.author_display = 'profile'
                            AND EXISTS (
                                SELECT 1 FROM published_work_assets asset
                                WHERE asset.version_id = version.id AND asset.role = 'content' AND asset.media_type IN ('image', 'video')
                            )
                      )
                  ))
             ), changed AS (
                ${changeSql}
             )
             SELECT target.followed_user_id,
                    EXISTS (SELECT 1 FROM changed) AS changed,
                    ($3::boolean AND (
                        EXISTS (SELECT 1 FROM changed)
                        OR EXISTS (SELECT 1 FROM user_follows relation WHERE relation.follower_user_id = $2 AND relation.followed_user_id = target.followed_user_id)
                    )) AS active,
                    (SELECT count(*) FROM user_follows relation JOIN users follower ON follower.id = relation.follower_user_id AND follower.status = 'active' WHERE relation.followed_user_id = target.followed_user_id) AS follower_count
             FROM target`,
            active ? [username, followerUserId, active, changedAt] : [username, followerUserId, active],
        );
        return result.rows[0] ? mapUserFollowResult(result.rows[0]) : null;
    }

    async setBlockedUser(username: string, blockerUserId: string, active: boolean, changedAt: string) {
        const changeSql = active
            ? `INSERT INTO user_blocks (blocker_user_id, blocked_user_id, created_at)
               SELECT $2, target.blocked_user_id, $4 FROM target
               ON CONFLICT DO NOTHING RETURNING blocked_user_id`
            : `DELETE FROM user_blocks relation USING target
               WHERE relation.blocker_user_id = $2 AND relation.blocked_user_id = target.blocked_user_id
               RETURNING relation.blocked_user_id`;
        const result = await this.db.query(
            `WITH target AS (
                SELECT blocked.id AS blocked_user_id
                FROM users blocked
                JOIN users actor ON actor.id = $2 AND actor.status = 'active'
                WHERE lower(blocked.username) = lower($1)
                  AND blocked.status = 'active'
                  AND blocked.id <> $2
             ), changed AS (
                ${changeSql}
             ), removed_follows AS (
                DELETE FROM user_follows relation USING target
                WHERE $3::boolean
                  AND ((relation.follower_user_id = $2 AND relation.followed_user_id = target.blocked_user_id)
                    OR (relation.follower_user_id = target.blocked_user_id AND relation.followed_user_id = $2))
                RETURNING relation.follower_user_id
             )
             SELECT target.blocked_user_id,
                    EXISTS (SELECT 1 FROM changed) AS changed,
                    ($3::boolean AND (
                        EXISTS (SELECT 1 FROM changed)
                        OR EXISTS (SELECT 1 FROM user_blocks relation WHERE relation.blocker_user_id = $2 AND relation.blocked_user_id = target.blocked_user_id)
                    )) AS active,
                    (SELECT count(*) FROM removed_follows) AS removed_follow_count
             FROM target`,
            active ? [username, blockerUserId, active, changedAt] : [username, blockerUserId, active],
        );
        return result.rows[0] ? mapUserBlockResult(result.rows[0]) : null;
    }

    async getPublicCreatorProfile(username: string) {
        const result = await this.db.query(
            `SELECT owner.id AS user_id, owner.username, owner.display_name, owner.bio, owner.avatar_storage_key, owner.updated_at AS avatar_updated_at,
                    work_stats.published_work_count, work_stats.received_like_count,
                    (SELECT count(*) FROM user_follows relation JOIN users follower ON follower.id = relation.follower_user_id AND follower.status = 'active' WHERE relation.followed_user_id = owner.id) AS follower_count,
                    (SELECT count(*) FROM user_follows relation JOIN users followed ON followed.id = relation.followed_user_id AND followed.status = 'active' WHERE relation.follower_user_id = owner.id) AS following_count
             FROM users owner
             JOIN LATERAL (
                SELECT count(*) AS published_work_count, coalesce(sum(work.like_count), 0) AS received_like_count
                FROM published_works work
                JOIN published_work_versions version ON version.id = work.published_version_id
                WHERE work.owner_user_id = owner.id
                  AND work.lifecycle_status = 'active'
                  AND version.moderation_status = 'approved'
                  AND version.visibility = 'public'
                  AND version.author_display = 'profile'
                  AND EXISTS (
                      SELECT 1 FROM published_work_assets asset
                      WHERE asset.version_id = version.id AND asset.role = 'content' AND asset.media_type IN ('image', 'video')
                  )
                HAVING count(*) > 0
             ) work_stats ON true
             WHERE lower(owner.username) = lower($1) AND owner.status = 'active'`,
            [username],
        );
        return result.rows[0] ? mapPublicCreatorProfile(result.rows[0]) : null;
    }

    async isFollowingUser(followerUserId: string, username: string) {
        const result = await this.db.query(
            `SELECT EXISTS (
                SELECT 1 FROM user_follows relation
                JOIN users followed ON followed.id = relation.followed_user_id
                WHERE relation.follower_user_id = $1 AND lower(followed.username) = lower($2)
             ) AS active`,
            [followerUserId, username],
        );
        return result.rows[0]?.active === true;
    }

    async isBlockedUser(viewerUserId: string, username: string) {
        const result = await this.db.query(
            `SELECT EXISTS (
                SELECT 1 FROM users target
                JOIN user_blocks relation ON
                    (relation.blocker_user_id = $1 AND relation.blocked_user_id = target.id)
                    OR (relation.blocker_user_id = target.id AND relation.blocked_user_id = $1)
                WHERE lower(target.username) = lower($2)
             ) AS active`,
            [viewerUserId, username],
        );
        return result.rows[0]?.active === true;
    }

    async listPublicCreatorWorks(username: string, input: { limit: number; after?: PublicCreatorWorkCursor }) {
        const limit = Math.max(1, Math.min(36, Math.floor(input.limit || 18)));
        const result = await this.db.query(
            `SELECT work.id AS work_id, work.owner_user_id AS author_user_id, work.slug, work.source_type, work.view_count, work.like_count, work.is_featured, work.featured_at,
                    version.id AS version_id, coalesce(version.reviewed_at, version.updated_at) AS published_at,
                    version.title, version.description, version.public_prompt, version.category, version.tags, version.author_display, version.author_name,
                    owner.username AS author_username, owner.avatar_storage_key AS owner_avatar_storage_key, owner.updated_at AS owner_avatar_updated_at,
                    preview.id AS asset_id, preview.media_type AS asset_media_type, preview.mime_type AS asset_mime_type
             FROM users owner
             JOIN published_works work ON work.owner_user_id = owner.id
             JOIN published_work_versions version ON version.id = work.published_version_id
             LEFT JOIN LATERAL (
                SELECT asset.id, asset.media_type, asset.mime_type
                FROM published_work_assets asset
                WHERE asset.version_id = version.id AND asset.media_type IN ('image', 'video')
                ORDER BY CASE WHEN asset.role = 'cover' THEN 0 ELSE 1 END, asset.sort_order, asset.id LIMIT 1
             ) preview ON true
             WHERE lower(owner.username) = lower($1)
               AND owner.status = 'active'
               AND work.lifecycle_status = 'active'
               AND version.moderation_status = 'approved'
               AND version.visibility = 'public'
               AND version.author_display = 'profile'
               AND EXISTS (
                    SELECT 1 FROM published_work_assets asset
                    WHERE asset.version_id = version.id AND asset.role = 'content' AND asset.media_type IN ('image', 'video')
               )
               AND ($2::timestamptz IS NULL OR (coalesce(version.reviewed_at, version.updated_at), work.id) < ($2::timestamptz, $3::text))
             ORDER BY coalesce(version.reviewed_at, version.updated_at) DESC, work.id DESC
             LIMIT $4`,
            [username, input.after?.publishedAt || null, input.after?.id || null, limit + 1],
        );
        const mapped = result.rows.map(mapPublishedGalleryItem);
        return { items: mapped.slice(0, limit), hasMore: mapped.length > limit };
    }

    async listRanking(input: { windowDays: 7 | 30; limit: number; after?: WorkCommunityRankingCursor }) {
        const limit = Math.max(1, Math.min(48, Math.floor(input.limit || 12)));
        const result = await this.db.query(
            `WITH eligible_work AS (
                SELECT work.id AS work_id, work.owner_user_id AS author_user_id, work.slug, work.source_type, work.view_count,
                       work.like_count, work.is_featured, work.featured_at,
                       version.id AS version_id, coalesce(version.reviewed_at, version.updated_at) AS published_at,
                       version.title, version.description, version.public_prompt, version.category, version.tags, version.author_display, version.author_name,
                       owner.username AS author_username, owner.avatar_storage_key AS owner_avatar_storage_key, owner.updated_at AS owner_avatar_updated_at
                FROM published_works work
                JOIN published_work_versions version ON version.id = work.published_version_id
                JOIN users owner ON owner.id = work.owner_user_id AND owner.status = 'active'
                WHERE work.lifecycle_status = 'active' AND version.moderation_status = 'approved' AND version.visibility = 'public'
             ), interaction AS (
                SELECT relation.work_id, 3::bigint AS points, 1::bigint AS like_count
                FROM published_work_likes relation
                JOIN eligible_work work ON work.work_id = relation.work_id
                JOIN users actor ON actor.id = relation.user_id AND actor.status = 'active'
                WHERE relation.created_at >= now() - make_interval(days => $1)
                  AND actor.id <> work.author_user_id AND actor.created_at <= relation.created_at - interval '24 hours'
             ), aggregate AS (
                SELECT work_id, sum(points)::bigint AS interaction_score, sum(like_count)::bigint AS window_like_count
                FROM interaction GROUP BY work_id
             ), scored AS (
                SELECT work.*, coalesce(aggregate.window_like_count, 0)::bigint AS window_like_count,
                       (coalesce(aggregate.interaction_score, 0)
                        + CASE WHEN work.is_featured THEN 8 ELSE 0 END
                        + greatest(0, 7 - floor(extract(epoch FROM (now() - work.published_at)) / 86400))::bigint) AS score
                FROM eligible_work work LEFT JOIN aggregate ON aggregate.work_id = work.work_id
             )
             SELECT scored.*,
                    CASE WHEN scored.author_display = 'hidden' THEN NULL ELSE scored.author_name END AS author_name,
                    preview.id AS asset_id, preview.media_type AS asset_media_type, preview.mime_type AS asset_mime_type
             FROM scored
             LEFT JOIN LATERAL (
                SELECT asset.id, asset.media_type, asset.mime_type FROM published_work_assets asset
                WHERE asset.version_id = scored.version_id
                ORDER BY CASE WHEN asset.role = 'cover' THEN 0 ELSE 1 END, asset.sort_order, asset.id LIMIT 1
             ) preview ON true
             WHERE ($5::text IS NULL OR (scored.score, scored.window_like_count, scored.published_at, scored.work_id)
                    < ($2::bigint, $3::bigint, $4::timestamptz, $5::text))
             ORDER BY scored.score DESC, scored.window_like_count DESC, scored.published_at DESC, scored.work_id DESC
             LIMIT $6`,
            [input.windowDays, input.after?.score ?? null, input.after?.windowLikeCount ?? null, input.after?.publishedAt ?? null, input.after?.id ?? null, limit + 1],
        );
        const mapped = result.rows.map(mapPublishedWorkRanking);
        return { items: mapped.slice(0, limit), hasMore: mapped.length > limit };
    }

    async listUserFollows(userId: string, input: PageInput = {}): Promise<PageResult<FollowedUserRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const result = await this.db.query(
            `SELECT followed.id AS user_id, followed.username, followed.display_name, followed.bio, followed.avatar_storage_key, followed.updated_at AS avatar_updated_at,
                    relation.created_at AS followed_at,
                    (SELECT count(*) FROM user_follows follower_relation JOIN users follower ON follower.id = follower_relation.follower_user_id AND follower.status = 'active' WHERE follower_relation.followed_user_id = followed.id) AS follower_count,
                    EXISTS (
                        SELECT 1 FROM published_works work JOIN published_work_versions version ON version.id = work.published_version_id
                        WHERE work.owner_user_id = followed.id AND work.lifecycle_status = 'active' AND version.moderation_status = 'approved'
                          AND version.visibility = 'public' AND version.author_display = 'profile'
                          AND EXISTS (SELECT 1 FROM published_work_assets asset WHERE asset.version_id = version.id AND asset.role = 'content' AND asset.media_type IN ('image', 'video'))
                    ) AS public_profile_available,
                    count(*) OVER() AS total_count
             FROM user_follows relation
             JOIN users followed ON followed.id = relation.followed_user_id AND followed.status = 'active'
             WHERE relation.follower_user_id = $1
               AND NOT EXISTS (
                    SELECT 1 FROM user_blocks blocked
                    WHERE (blocked.blocker_user_id = $1 AND blocked.blocked_user_id = followed.id)
                       OR (blocked.blocker_user_id = followed.id AND blocked.blocked_user_id = $1)
               )
             ORDER BY relation.created_at DESC, followed.id DESC LIMIT $2 OFFSET $3`,
            [userId, pageSize, (page - 1) * pageSize],
        );
        return pageResult(result.rows.map(mapFollowedUser), numberValue(result.rows[0]?.total_count), page, pageSize);
    }

    async listUserFollowers(userId: string, input: PageInput = {}): Promise<PageResult<CommunityUserRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const result = await this.db.query(
            `SELECT follower.id AS user_id, follower.username, follower.display_name, follower.bio, follower.avatar_storage_key, follower.updated_at AS avatar_updated_at,
                    relation.created_at AS related_at,
                    (SELECT count(*) FROM user_follows follower_relation JOIN users active_follower ON active_follower.id = follower_relation.follower_user_id AND active_follower.status = 'active' WHERE follower_relation.followed_user_id = follower.id) AS follower_count,
                    EXISTS (
                        SELECT 1 FROM published_works work JOIN published_work_versions version ON version.id = work.published_version_id
                        WHERE work.owner_user_id = follower.id AND work.lifecycle_status = 'active' AND version.moderation_status = 'approved'
                          AND version.visibility = 'public' AND version.author_display = 'profile'
                          AND EXISTS (SELECT 1 FROM published_work_assets asset WHERE asset.version_id = version.id AND asset.role = 'content' AND asset.media_type IN ('image', 'video'))
                    ) AS public_profile_available,
                    count(*) OVER() AS total_count
             FROM user_follows relation
             JOIN users follower ON follower.id = relation.follower_user_id AND follower.status = 'active'
             WHERE relation.followed_user_id = $1
               AND NOT EXISTS (
                    SELECT 1 FROM user_blocks blocked
                    WHERE (blocked.blocker_user_id = $1 AND blocked.blocked_user_id = follower.id)
                       OR (blocked.blocker_user_id = follower.id AND blocked.blocked_user_id = $1)
               )
             ORDER BY relation.created_at DESC, follower.id DESC LIMIT $2 OFFSET $3`,
            [userId, pageSize, (page - 1) * pageSize],
        );
        return pageResult(result.rows.map(mapCommunityUser), numberValue(result.rows[0]?.total_count), page, pageSize);
    }

    async listUserLikedWorks(userId: string, input: PageInput = {}): Promise<PageResult<LikedPublishedWorkRecord>> {
        const page = normalizePage(input.page);
        const pageSize = normalizePageSize(input.pageSize);
        const result = await this.db.query(
            `SELECT work.id AS work_id, work.owner_user_id AS author_user_id, work.slug, work.source_type, work.view_count, work.like_count, work.is_featured, work.featured_at,
                    version.id AS version_id, coalesce(version.reviewed_at, version.updated_at) AS published_at,
                    version.title, version.description, version.public_prompt, version.category, version.tags, version.author_display,
                    CASE WHEN version.author_display = 'hidden' THEN NULL ELSE version.author_name END AS author_name,
                    owner.username AS author_username, owner.avatar_storage_key AS owner_avatar_storage_key, owner.updated_at AS owner_avatar_updated_at,
                    preview.id AS asset_id, preview.media_type AS asset_media_type, preview.mime_type AS asset_mime_type,
                    relation.created_at AS liked_at, count(*) OVER() AS total_count
             FROM published_work_likes relation
             JOIN published_works work ON work.id = relation.work_id
             JOIN published_work_versions version ON version.id = work.published_version_id
             JOIN users owner ON owner.id = work.owner_user_id AND owner.status = 'active'
             LEFT JOIN LATERAL (
                SELECT asset.id, asset.media_type, asset.mime_type FROM published_work_assets asset
                WHERE asset.version_id = version.id AND asset.media_type IN ('image', 'video')
                ORDER BY CASE WHEN asset.role = 'cover' THEN 0 ELSE 1 END, asset.sort_order, asset.id LIMIT 1
             ) preview ON true
             WHERE relation.user_id = $1 AND work.lifecycle_status = 'active'
               AND version.moderation_status = 'approved' AND version.visibility = 'public'
               AND EXISTS (SELECT 1 FROM published_work_assets asset WHERE asset.version_id = version.id AND asset.role = 'content' AND asset.media_type IN ('image', 'video'))
             ORDER BY relation.created_at DESC, work.id DESC LIMIT $2 OFFSET $3`,
            [userId, pageSize, (page - 1) * pageSize],
        );
        return pageResult(result.rows.map(mapLikedPublishedWork), numberValue(result.rows[0]?.total_count), page, pageSize);
    }

    async getUserCommunitySummary(userId: string) {
        const result = await this.db.query(
            `SELECT actor.username,
                    (SELECT count(*) FROM published_works work JOIN published_work_versions version ON version.id = work.published_version_id
                     WHERE work.owner_user_id = actor.id AND work.lifecycle_status = 'active' AND version.moderation_status = 'approved'
                       AND version.visibility = 'public' AND version.author_display = 'profile'
                       AND EXISTS (SELECT 1 FROM published_work_assets asset WHERE asset.version_id = version.id AND asset.role = 'content' AND asset.media_type IN ('image', 'video'))) AS published_work_count,
                    (SELECT count(*) FROM user_follows relation JOIN users followed ON followed.id = relation.followed_user_id AND followed.status = 'active' WHERE relation.follower_user_id = actor.id) AS following_count,
                    (SELECT count(*) FROM user_follows relation JOIN users follower ON follower.id = relation.follower_user_id AND follower.status = 'active' WHERE relation.followed_user_id = actor.id) AS follower_count,
                    (SELECT count(*) FROM published_work_likes relation
                     JOIN published_works work ON work.id = relation.work_id
                     JOIN published_work_versions version ON version.id = work.published_version_id
                     JOIN users owner ON owner.id = work.owner_user_id AND owner.status = 'active'
                     WHERE relation.user_id = actor.id AND work.lifecycle_status = 'active' AND version.moderation_status = 'approved' AND version.visibility = 'public'
                       AND EXISTS (SELECT 1 FROM published_work_assets asset WHERE asset.version_id = version.id AND asset.role = 'content' AND asset.media_type IN ('image', 'video'))) AS liked_work_count
             FROM users actor WHERE actor.id = $1 AND actor.status = 'active'`,
            [userId],
        );
        return result.rows[0] ? mapUserCommunitySummary(result.rows[0]) : null;
    }

    async createNotification(notification: UserNotificationRecord) {
        const result = await this.db.query(
            `INSERT INTO user_notifications (
                id, user_id, actor_user_id, notification_type, work_id,
                target_path, summary, dedup_key, read_at, created_at
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT (user_id, dedup_key) DO NOTHING RETURNING *`,
            [
                notification.id,
                notification.userId,
                notification.actorUserId || null,
                notification.notificationType,
                notification.workId || null,
                notification.targetPath,
                notification.summary,
                notification.dedupKey,
                notification.readAt || null,
                notification.createdAt,
            ],
        );
        return result.rows[0] ? mapUserNotification(result.rows[0]) : null;
    }

    async listNotifications(userId: string, input: { limit: number; after?: NotificationCursor }) {
        const limit = Math.max(1, Math.min(50, Math.floor(input.limit || 20)));
        const result = await this.db.query(
            `SELECT notification.*,
                    CASE WHEN actor.status = 'active' THEN actor.username ELSE NULL END AS actor_username,
                    CASE WHEN actor.status = 'active' THEN actor.display_name ELSE NULL END AS actor_display_name
             FROM user_notifications notification
             LEFT JOIN users actor ON actor.id = notification.actor_user_id
             WHERE notification.user_id = $1
               AND ($2::timestamptz IS NULL OR (notification.created_at, notification.id) < ($2::timestamptz, $3::text))
             ORDER BY notification.created_at DESC, notification.id DESC LIMIT $4`,
            [userId, input.after?.createdAt || null, input.after?.id || null, limit + 1],
        );
        const mapped = result.rows.map(mapUserNotification);
        return { items: mapped.slice(0, limit), hasMore: mapped.length > limit };
    }

    async countUnreadNotifications(userId: string) {
        const result = await this.db.query("SELECT count(*) AS total FROM user_notifications WHERE user_id = $1 AND read_at IS NULL", [userId]);
        return numberValue(result.rows[0]?.total);
    }

    async markNotificationRead(id: string, userId: string, readAt: string) {
        const result = await this.db.query("UPDATE user_notifications SET read_at = COALESCE(read_at, $3) WHERE id = $1 AND user_id = $2 RETURNING *", [id, userId, readAt]);
        return result.rows[0] ? mapUserNotification(result.rows[0]) : null;
    }

    async markAllNotificationsRead(userId: string, readAt: string) {
        const result = await this.db.query("UPDATE user_notifications SET read_at = $2 WHERE user_id = $1 AND read_at IS NULL RETURNING id", [userId, readAt]);
        return result.rowCount || 0;
    }

    private async setLike(slug: string, userId: string, active: boolean, changedAt: string) {
        const activeParam = active ? "$4" : "$3";
        const changeSql = active
            ? `INSERT INTO published_work_likes (work_id, user_id, created_at)
               SELECT target.work_id, $2, $3 FROM target
               ON CONFLICT DO NOTHING RETURNING work_id`
            : `DELETE FROM published_work_likes relation USING target
               WHERE relation.work_id = target.work_id AND relation.user_id = $2
               RETURNING relation.work_id`;
        const delta = active ? 1 : -1;
        const result = await this.db.query(
            `WITH target AS (
                SELECT work.id AS work_id, work.published_version_id AS version_id, work.owner_user_id
                FROM published_works work
                JOIN published_work_versions version ON version.id = work.published_version_id
                JOIN users owner ON owner.id = work.owner_user_id AND owner.status = 'active'
                JOIN users actor ON actor.id = $2 AND actor.status = 'active'
                WHERE lower(work.slug) = lower($1)
                  AND work.lifecycle_status = 'active'
                  AND version.moderation_status = 'approved'
                  AND version.visibility IN ('unlisted', 'public')
                FOR UPDATE OF work
             ), changed AS (
                ${changeSql}
             ), updated AS (
                UPDATE published_works work SET like_count = greatest(0, work.like_count + ${delta})
                WHERE work.id = (SELECT work_id FROM target) AND EXISTS (SELECT 1 FROM changed)
                RETURNING work.*
             )
             SELECT target.work_id, target.version_id, target.owner_user_id,
                    EXISTS (SELECT 1 FROM changed) AS changed,
                    (${activeParam}::boolean AND (
                        EXISTS (SELECT 1 FROM changed)
                        OR EXISTS (SELECT 1 FROM published_work_likes relation WHERE relation.work_id = target.work_id AND relation.user_id = $2)
                    )) AS active,
                    coalesce(updated.like_count, work.like_count) AS like_count
             FROM target
             JOIN published_works work ON work.id = target.work_id
             LEFT JOIN updated ON updated.id = target.work_id`,
            active ? [slug, userId, changedAt, active] : [slug, userId, active],
        );
        return result.rows[0] ? mapWorkCommunityRelationResult(result.rows[0]) : null;
    }
}
