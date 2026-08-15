import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { withPostgresTransaction, type QueryExecutor } from "./postgres";
import { WorkCommunityRepository } from "./work-community-repository";

const describePostgres = process.env.RUN_WORK_COMMUNITY_POSTGRES_INTEGRATION === "1" ? describe : describe.skip;

describePostgres("work community PostgreSQL integration", () => {
    it("returns authoritative state for like and work-author follow toggles", async () => {
        const rollbackOnly = new Error("rollback integration fixture");

        await expect(
            withPostgresTransaction(async (client) => {
                const creator = await insertPublicCreator(client);

                const actor = await insertTestActor(client);
                const repository = new WorkCommunityRepository(client);

                await expect(repository.setLiked(creator.slug, actor.id, true, new Date().toISOString())).resolves.toMatchObject({ active: true, changed: true, likeCount: creator.likeCount + 1 });
                await expect(repository.setLiked(creator.slug, actor.id, true, new Date().toISOString())).resolves.toMatchObject({ active: true, changed: false, likeCount: creator.likeCount + 1 });
                await expect(repository.setLiked(creator.slug, actor.id, false, new Date().toISOString())).resolves.toMatchObject({ active: false, changed: true, likeCount: creator.likeCount });
                await expect(repository.setLiked(creator.slug, actor.id, false, new Date().toISOString())).resolves.toMatchObject({ active: false, changed: false, likeCount: creator.likeCount });

                await expect(repository.setFollowingAuthor(creator.slug, actor.id, true, new Date().toISOString())).resolves.toMatchObject({ active: true, changed: true });
                await expect(repository.setFollowingAuthor(creator.slug, actor.id, true, new Date().toISOString())).resolves.toMatchObject({ active: true, changed: false });
                await expect(repository.setFollowingAuthor(creator.slug, actor.id, false, new Date().toISOString())).resolves.toMatchObject({ active: false, changed: true });
                await expect(repository.setFollowingAuthor(creator.slug, actor.id, false, new Date().toISOString())).resolves.toMatchObject({ active: false, changed: false });

                throw rollbackOnly;
            }),
        ).rejects.toBe(rollbackOnly);
    });

    it("blocks a second account, removes both follow directions, and allows following after unblock", async () => {
        const rollbackOnly = new Error("rollback integration fixture");

        await expect(
            withPostgresTransaction(async (client) => {
                const creator = await insertPublicCreator(client);

                const actor = await insertTestActor(client);
                await client.query(
                    `INSERT INTO user_follows (follower_user_id, followed_user_id, created_at)
                     VALUES ($1, $2, now()), ($2, $1, now())`,
                    [actor.id, creator.id],
                );

                const repository = new WorkCommunityRepository(client);
                const blocked = await repository.setBlockedUser(creator.username, actor.id, true, new Date().toISOString());
                expect(blocked).toMatchObject({ active: true, changed: true, removedFollowCount: 2 });
                await expect(repository.setBlockedUser(creator.username, actor.id, true, new Date().toISOString())).resolves.toMatchObject({ active: true, changed: false, removedFollowCount: 0 });
                await expect(relationCount(client, actor.id, creator.id)).resolves.toBe(0);
                await expect(repository.isBlockedUser(actor.id, creator.username)).resolves.toBe(true);
                await expect(repository.setFollowingUser(creator.username, actor.id, true, new Date().toISOString())).resolves.toBeNull();

                const [following, followers] = await Promise.all([repository.listUserFollows(actor.id), repository.listUserFollowers(actor.id)]);
                expect(following.items).toEqual([]);
                expect(followers.items).toEqual([]);

                const unblocked = await repository.setBlockedUser(creator.username, actor.id, false, new Date().toISOString());
                expect(unblocked).toMatchObject({ active: false, changed: true, removedFollowCount: 0 });
                await expect(repository.isBlockedUser(actor.id, creator.username)).resolves.toBe(false);
                await expect(repository.setFollowingUser(creator.username, actor.id, true, new Date().toISOString())).resolves.toMatchObject({ active: true, changed: true });
                await expect(repository.setFollowingUser(creator.username, actor.id, false, new Date().toISOString())).resolves.toMatchObject({ active: false, changed: true });
                await expect(repository.setBlockedUser(creator.username, actor.id, false, new Date().toISOString())).resolves.toMatchObject({ active: false, changed: false, removedFollowCount: 0 });

                throw rollbackOnly;
            }),
        ).rejects.toBe(rollbackOnly);
    });
});

async function insertPublicCreator(client: QueryExecutor) {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const creator = {
        id: randomUUID(),
        username: `community_creator_${suffix}`,
        workId: randomUUID(),
        versionId: randomUUID(),
        slug: `community-work-${suffix}`,
        storageKey: `generation/community-test-${suffix}.png`,
        likeCount: 0,
    };

    await client.query(
        `INSERT INTO users (id, username, display_name, password_hash, status)
         VALUES ($1, $2, '社区集成测试作者', 'integration-test-only', 'active')`,
        [creator.id, creator.username],
    );
    await client.query(
        `INSERT INTO published_works (id, owner_user_id, slug, source_type, source_id, lifecycle_status)
         VALUES ($1, $2, $3, 'media', $4, 'active')`,
        [creator.workId, creator.id, creator.slug, `integration-${suffix}`],
    );
    await client.query(
        `INSERT INTO published_work_versions (
            id, work_id, version_number, title, visibility, author_display, moderation_status, reviewed_at
         ) VALUES ($1, $2, 1, '社区集成测试作品', 'public', 'profile', 'approved', now())`,
        [creator.versionId, creator.workId],
    );
    await client.query(
        `INSERT INTO local_media_assets (
            storage_key, scope, storage_class, type, owner_user_id, source, mime_type, bytes
         ) VALUES ($1, 'generation', 'permanent', 'image', $2, 'community-integration-test', 'image/png', 1)`,
        [creator.storageKey, creator.id],
    );
    await client.query(
        `INSERT INTO published_work_assets (id, version_id, storage_key, media_type, mime_type, role)
         VALUES ($1, $2, $3, 'image', 'image/png', 'content')`,
        [randomUUID(), creator.versionId, creator.storageKey],
    );
    await client.query("UPDATE published_works SET current_version_id = $2, published_version_id = $2 WHERE id = $1", [creator.workId, creator.versionId]);

    return creator;
}

async function insertTestActor(client: QueryExecutor) {
    const actor = { id: randomUUID(), username: `community_test_${randomUUID().replaceAll("-", "").slice(0, 12)}` };
    await client.query(
        `INSERT INTO users (id, username, display_name, password_hash, status)
         VALUES ($1, $2, '社区集成测试用户', 'integration-test-only', 'active')`,
        [actor.id, actor.username],
    );
    return actor;
}

async function relationCount(client: QueryExecutor, leftUserId: string, rightUserId: string) {
    const result = await client.query<{ total: string }>(
        `SELECT count(*)::text AS total
         FROM user_follows
         WHERE (follower_user_id = $1 AND followed_user_id = $2)
            OR (follower_user_id = $2 AND followed_user_id = $1)`,
        [leftUserId, rightUserId],
    );
    return Number(result.rows[0]?.total || 0);
}
