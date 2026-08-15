import { describe, expect, it, vi } from "vitest";

import { WorkCommunityRepository } from "./work-community-repository";

const now = "2026-07-27T00:00:00.000Z";

describe("WorkCommunityRepository", () => {
    it("creates likes idempotently and updates the counter under the work lock", async () => {
        const query = vi.fn().mockResolvedValue({
            rows: [
                {
                    work_id: "work-one",
                    version_id: "version-one",
                    owner_user_id: "owner-one",
                    changed: true,
                    active: true,
                    like_count: 2,
                },
            ],
        });
        const repository = new WorkCommunityRepository({ query });

        const result = await repository.setLiked("work-one", "user-one", true, now);
        const [sql, values] = query.mock.calls[0] as [string, unknown[]];

        expect(sql).toContain("FOR UPDATE OF work");
        expect(sql).toContain("INSERT INTO published_work_likes");
        expect(sql).toContain("ON CONFLICT DO NOTHING");
        expect(sql).toContain("like_count = greatest(0, work.like_count + 1)");
        expect(sql).toContain("$4::boolean AND");
        expect(sql).toContain("EXISTS (SELECT 1 FROM changed)");
        expect(values).toEqual(["work-one", "user-one", now, true]);
        expect(result).toMatchObject({ changed: true, active: true, likeCount: 2 });
    });

    it("removes an existing like and returns the authoritative inactive state", async () => {
        const query = vi.fn().mockResolvedValue({
            rows: [
                {
                    work_id: "work-one",
                    version_id: "version-one",
                    owner_user_id: "owner-one",
                    changed: true,
                    active: false,
                    like_count: 1,
                },
            ],
        });
        const repository = new WorkCommunityRepository({ query });

        const result = await repository.setLiked("work-one", "user-one", false, now);
        const [sql, values] = query.mock.calls[0] as [string, unknown[]];

        expect(sql).toContain("DELETE FROM published_work_likes");
        expect(sql).toContain("like_count = greatest(0, work.like_count + -1)");
        expect(sql).toContain("$3::boolean AND");
        expect(values).toEqual(["work-one", "user-one", false]);
        expect(result).toMatchObject({ changed: true, active: false, likeCount: 1 });
    });

    it("only follows active profile authors and prevents self follows", async () => {
        const query = vi.fn().mockResolvedValue({ rows: [] });
        const repository = new WorkCommunityRepository({ query });

        await repository.setFollowingAuthor("work-one", "user-one", true, now);
        const sql = query.mock.calls[0]?.[0] as string;

        expect(sql).toContain("version.author_display = 'profile'");
        expect(sql).toContain("work.owner_user_id <> $2");
        expect(sql).toContain("owner.status = 'active'");
        expect(sql).toContain("user_blocks");
        expect(sql).toContain("ON CONFLICT DO NOTHING");
        expect(sql).toContain("$4::boolean AND");
    });

    it("blocks users idempotently and removes both follow directions in the same statement", async () => {
        const query = vi.fn().mockResolvedValue({
            rows: [{ blocked_user_id: "user-two", changed: true, active: true, removed_follow_count: 2 }],
        });
        const repository = new WorkCommunityRepository({ query });

        const result = await repository.setBlockedUser("user-two", "user-one", true, now);
        const [sql, values] = query.mock.calls[0] as [string, unknown[]];

        expect(sql).toContain("INSERT INTO user_blocks");
        expect(sql).toContain("ON CONFLICT DO NOTHING");
        expect(sql).toContain("DELETE FROM user_follows");
        expect(sql).toContain("relation.follower_user_id = target.blocked_user_id");
        expect(sql).toContain("$3::boolean AND");
        expect(values).toEqual(["user-two", "user-one", true, now]);
        expect(result).toEqual({ blockedUserId: "user-two", changed: true, active: true, removedFollowCount: 2 });
    });

    it("does not bind the unused timestamp when unfollowing or unblocking", async () => {
        const query = vi.fn().mockResolvedValue({ rows: [{ followed_user_id: "user-two", changed: true, active: false, follower_count: 0 }] });
        const repository = new WorkCommunityRepository({ query });

        await repository.setFollowingAuthor("work-two", "user-one", false, now);
        await repository.setFollowingUser("user-two", "user-one", false, now);
        await repository.setBlockedUser("user-two", "user-one", false, now);

        expect(query.mock.calls[0]?.[1]).toEqual(["work-two", "user-one", false]);
        expect(query.mock.calls[1]?.[1]).toEqual(["user-two", "user-one", false]);
        expect(query.mock.calls[2]?.[1]).toEqual(["user-two", "user-one", false]);
        expect(query.mock.calls[0]?.[0]).toContain("$3::boolean AND");
        expect(query.mock.calls[1]?.[0]).toContain("$3::boolean AND");
        expect(query.mock.calls[2]?.[0]).toContain("$3::boolean AND");
    });

    it("ranks with bounded windows, trusted actors and a full keyset tuple", async () => {
        const query = vi.fn().mockResolvedValue({ rows: [] });
        const repository = new WorkCommunityRepository({ query });

        await repository.listRanking({
            windowDays: 7,
            limit: 12,
            after: { score: 20, windowLikeCount: 3, publishedAt: now, id: "work-one" },
        });
        const [sql, values] = query.mock.calls[0] as [string, unknown[]];

        expect(sql).toContain("make_interval(days => $1)");
        expect(sql).toContain("actor.status = 'active'");
        expect(sql).toContain("actor.id <> work.author_user_id");
        expect(sql).toContain("actor.created_at <= relation.created_at - interval '24 hours'");
        expect(sql).toContain("3::bigint AS points");
        expect(sql).not.toContain("published_work_favorites");
        expect(sql).not.toContain("published_work_comments");
        expect(sql).toContain("CASE WHEN work.is_featured THEN 8 ELSE 0 END");
        expect(sql).toContain("(scored.score, scored.window_like_count, scored.published_at, scored.work_id)");
        expect(sql).not.toContain("OFFSET");
        expect(values).toEqual([7, 20, 3, now, "work-one", 13]);
    });

    it("deduplicates notifications and pages them by creation tuple", async () => {
        const query = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });
        const repository = new WorkCommunityRepository({ query });

        await repository.createNotification({
            id: "notification-one",
            userId: "owner-one",
            actorUserId: "user-one",
            notificationType: "work_like",
            workId: "work-one",
            targetPath: "/share/work-one",
            summary: "有人赞了你的作品",
            dedupKey: "work-like:work-one:user-one",
            createdAt: now,
        });
        await repository.listNotifications("owner-one", { limit: 20, after: { createdAt: now, id: "notification-one" } });

        const insertSql = query.mock.calls[0]?.[0] as string;
        const listSql = query.mock.calls[1]?.[0] as string;
        expect(insertSql).toContain("ON CONFLICT (user_id, dedup_key) DO NOTHING");
        expect(listSql).toContain("(notification.created_at, notification.id) <");
        expect(listSql).not.toContain("OFFSET");
    });

    it("only exposes active creators with public profile works", async () => {
        const query = vi.fn().mockResolvedValue({
            rows: [
                {
                    user_id: "creator-one",
                    username: "creator",
                    display_name: "创作者",
                    bio: "简介",
                    published_work_count: 2,
                    received_like_count: 8,
                    follower_count: 3,
                    following_count: 4,
                },
            ],
        });
        const repository = new WorkCommunityRepository({ query });

        const result = await repository.getPublicCreatorProfile("creator");
        const [sql, values] = query.mock.calls[0] as [string, unknown[]];

        expect(sql).toContain("owner.status = 'active'");
        expect(sql).toContain("version.visibility = 'public'");
        expect(sql).toContain("version.author_display = 'profile'");
        expect(sql).toContain("HAVING count(*) > 0");
        expect(values).toEqual(["creator"]);
        expect(result).toMatchObject({ userId: "creator-one", username: "creator", publishedWorkCount: 2 });
    });

    it("pages creator works by publication tuple without offset or per-card queries", async () => {
        const query = vi.fn().mockResolvedValue({ rows: [] });
        const repository = new WorkCommunityRepository({ query });

        await repository.listPublicCreatorWorks("creator", { limit: 18, after: { publishedAt: now, id: "work-one" } });
        const [sql, values] = query.mock.calls[0] as [string, unknown[]];

        expect(sql).toContain("version.author_display = 'profile'");
        expect(sql).toContain("asset.role = 'content'");
        expect(sql).toContain("(coalesce(version.reviewed_at, version.updated_at), work.id) <");
        expect(sql).toContain("LEFT JOIN LATERAL");
        expect(sql).not.toContain("OFFSET");
        expect(values).toEqual(["creator", now, "work-one", 19]);
        expect(query).toHaveBeenCalledTimes(1);
    });

    it("keeps private liked works scoped to the current user and valid public media", async () => {
        const query = vi.fn().mockResolvedValue({ rows: [] });
        const repository = new WorkCommunityRepository({ query });

        await repository.listUserLikedWorks("user-one", { page: 2, pageSize: 12 });
        const [sql, values] = query.mock.calls[0] as [string, unknown[]];

        expect(sql).toContain("WHERE relation.user_id = $1");
        expect(sql).toContain("owner.status = 'active'");
        expect(sql).toContain("version.visibility = 'public'");
        expect(sql).toContain("asset.media_type IN ('image', 'video')");
        expect(values).toEqual(["user-one", 12, 12]);
    });
});
