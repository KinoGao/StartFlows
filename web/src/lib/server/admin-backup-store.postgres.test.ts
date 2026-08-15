import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { ensurePostgresSchema, postgresQuery } from "@/lib/server/database";

import { readAdminBackupData, restoreAdminBackupData } from "./admin-backup-store";

const postgresIt = process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION === "1" ? it : it.skip;

describe("admin backup PostgreSQL integration", () => {
    postgresIt("keeps backup-missing users and referenced Canvas, library, media and drama data", async () => {
        await ensurePostgresSchema();
        const fixture = await createFixture();
        try {
            const current = await readAdminBackupData();
            const partial = structuredClone(current);
            partial.auth.users = partial.auth.users.filter((user) => user.id !== fixture.userId);
            partial.auth.sessions = partial.auth.sessions.filter((session) => session.userId !== fixture.userId);
            partial.auth.pointRecords = partial.auth.pointRecords.filter((record) => record.userId !== fixture.userId);
            partial.prompts.prompts = partial.prompts.prompts.filter((prompt) => prompt.ownerUserId !== fixture.userId);
            partial.generationLogs.logs = partial.generationLogs.logs.filter((log) => log.userId !== fixture.userId);
            partial.accountDeletionRequests.requests = partial.accountDeletionRequests.requests.filter((request) => request.userId !== fixture.userId);

            await restoreAdminBackupData(partial);

            await expect(fixtureCounts(fixture)).resolves.toEqual({ users: 1, sessions: 1, canvas: 1, library: 1, media: 1, drama: 1 });
        } finally {
            await postgresQuery("DELETE FROM users WHERE id = $1", [fixture.userId]);
        }
    });

    postgresIt("rolls back all account updates when a later restore section fails", async () => {
        await ensurePostgresSchema();
        const fixture = await createFixture();
        try {
            const current = await readAdminBackupData();
            const user = current.auth.users.find((item) => item.id === fixture.userId);
            if (!user) throw new Error("PostgreSQL restore fixture user is missing");
            const imported = structuredClone(current);
            imported.auth.users = [{ ...user, displayName: "不应提交的名称" }];
            imported.generationLogs.logs = [
                {
                    id: `invalid-log-${randomUUID()}`,
                    userId: fixture.userId,
                    conversationId: `missing-conversation-${randomUUID()}`,
                    username: user.username,
                    displayName: user.displayName,
                    kind: "image",
                    source: "image-workbench",
                    status: "success",
                    title: "事务回滚测试",
                    prompt: "事务回滚测试",
                    model: "test",
                    summary: "",
                    durationMs: 1,
                    count: 1,
                    successCount: 1,
                    failCount: 0,
                    assets: [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                },
            ];

            await expect(restoreAdminBackupData(imported)).rejects.toThrow();

            const result = await postgresQuery<{ display_name: string }>("SELECT display_name FROM users WHERE id = $1", [fixture.userId]);
            expect(result.rows[0]?.display_name).toBe(fixture.displayName);
        } finally {
            await postgresQuery("DELETE FROM users WHERE id = $1", [fixture.userId]);
        }
    });
});

async function createFixture() {
    const suffix = randomUUID().replaceAll("-", "");
    const fixture = {
        userId: `backup-user-${suffix}`,
        username: `backup_${suffix.slice(0, 16)}`,
        displayName: "备份保留用户",
        sessionId: `backup-session-${suffix}`,
        canvasId: `backup-canvas-${suffix}`,
        libraryId: `backup-library-${suffix}`,
        storageKey: `permanent/backup-test-${suffix}.png`,
        dramaId: `backup-drama-${suffix}`,
    };
    const planResult = await postgresQuery<{ id: string }>("SELECT id FROM entitlement_plans ORDER BY sort_order ASC LIMIT 1");
    const planId = planResult.rows[0]?.id;
    if (!planId) throw new Error("No entitlement plan is available for the PostgreSQL backup integration test");
    await postgresQuery(
        `INSERT INTO users (id, username, display_name, password_hash, status, plan_id)
         VALUES ($1, $2, $3, 'integration-test-only', 'active', $4)`,
        [fixture.userId, fixture.username, fixture.displayName, planId],
    );
    await postgresQuery("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, now() + interval '1 hour')", [fixture.sessionId, fixture.userId, `backup-token-${suffix}`]);
    await postgresQuery("INSERT INTO canvas_projects (id, user_id, title, project_json) VALUES ($1, $2, '备份画布', '{}'::jsonb)", [fixture.canvasId, fixture.userId]);
    await postgresQuery("INSERT INTO library_assets (id, user_id, kind, title, asset_json) VALUES ($1, $2, 'image', '备份素材', '{}'::jsonb)", [fixture.libraryId, fixture.userId]);
    await postgresQuery(
        `INSERT INTO local_media_assets (storage_key, scope, storage_class, type, owner_user_id, source, mime_type, bytes)
         VALUES ($1, 'reference', 'permanent', 'image', $2, 'backup-integration-test', 'image/png', 1)`,
        [fixture.storageKey, fixture.userId],
    );
    await postgresQuery("INSERT INTO drama_projects (id, user_id, title, project_json) VALUES ($1, $2, '备份短剧', '{}'::jsonb)", [fixture.dramaId, fixture.userId]);
    return fixture;
}

async function fixtureCounts(fixture: Awaited<ReturnType<typeof createFixture>>) {
    const result = await postgresQuery<{ user_total: string; session_total: string; canvas_total: string; library_total: string; media_total: string; drama_total: string }>(
        `SELECT
            (SELECT count(*) FROM users WHERE id = $1)::text AS user_total,
            (SELECT count(*) FROM sessions WHERE id = $2)::text AS session_total,
            (SELECT count(*) FROM canvas_projects WHERE id = $3)::text AS canvas_total,
            (SELECT count(*) FROM library_assets WHERE id = $4)::text AS library_total,
            (SELECT count(*) FROM local_media_assets WHERE storage_key = $5)::text AS media_total,
            (SELECT count(*) FROM drama_projects WHERE id = $6)::text AS drama_total`,
        [fixture.userId, fixture.sessionId, fixture.canvasId, fixture.libraryId, fixture.storageKey, fixture.dramaId],
    );
    const row = result.rows[0];
    return {
        users: Number(row?.user_total || 0),
        sessions: Number(row?.session_total || 0),
        canvas: Number(row?.canvas_total || 0),
        library: Number(row?.library_total || 0),
        media: Number(row?.media_total || 0),
        drama: Number(row?.drama_total || 0),
    };
}
