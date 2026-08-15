import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { createPostgresRepositories, ensurePostgresSchema, postgresQuery } from "@/lib/server/database";

import { cleanupExpiredStoredGenerationTasks } from "./generation-task-store";
import { consumePoints } from "./points-wallet-service";

const postgresIt = process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION === "1" ? it : it.skip;

describe("PostgreSQL points wallet idempotency", () => {
    postgresIt("updates a decimal daily balance without integer parameter inference", async () => {
        await ensurePostgresSchema();
        const repositories = createPostgresRepositories();
        const settings = await repositories.settings.getSettings();
        const planId = settings.settings?.defaultPlanId || settings.plans[0]?.id;
        if (!planId) throw new Error("No entitlement plan is available for the PostgreSQL integration test");

        const suffix = randomUUID();
        const userId = `test-points-decimal-${suffix}`;
        const now = new Date();
        try {
            await repositories.users.createWithNextAccountId({
                id: userId,
                username: `decimal_${suffix.replaceAll("-", "").slice(0, 16)}`,
                displayName: "小数积分测试用户",
                bio: "",
                role: "user",
                adminPermissions: [],
                status: "active",
                planId,
                pointsBalance: 0,
                passwordHash: "integration-test-only",
                createdAt: now.toISOString(),
                updatedAt: now.toISOString(),
            });
            await repositories.pointsWallet.createDailyWallet({
                userId,
                date: "2026-08-03",
                planId,
                grantedPoints: 2,
                remainingPoints: 2,
                createdAt: now.toISOString(),
                updatedAt: now.toISOString(),
            });

            const wallet = await repositories.pointsWallet.updateRemaining(userId, "2026-08-03", 1.7);

            expect(wallet?.remainingPoints).toBe(1.7);
        } finally {
            await repositories.users.delete(userId);
        }
    });

    postgresIt("persists the server request fingerprint and rejects conflicting replays", async () => {
        await ensurePostgresSchema();
        const repositories = createPostgresRepositories();
        const settings = await repositories.settings.getSettings();
        const planId = settings.settings?.defaultPlanId || settings.plans[0]?.id;
        if (!planId) throw new Error("No entitlement plan is available for the PostgreSQL integration test");

        const suffix = randomUUID();
        const userId = `test-points-idempotency-${suffix}`;
        const idempotencyKey = `system-ai:test-${suffix}`;
        const requestFingerprint = "a".repeat(64);
        const now = new Date();
        try {
            await repositories.users.createWithNextAccountId({
                id: userId,
                username: `points_${suffix.replaceAll("-", "").slice(0, 16)}`,
                displayName: "积分幂等测试用户",
                bio: "",
                role: "user",
                adminPermissions: [],
                status: "active",
                planId,
                pointsBalance: 100,
                passwordHash: "integration-test-only",
                createdAt: now.toISOString(),
                updatedAt: now.toISOString(),
            });

            const input = {
                userId,
                amount: 5,
                units: 1,
                usageKind: "text" as const,
                model: "writer",
                description: "文本模型调用扣除",
                idempotencyKey,
                requestFingerprint,
                now,
            };
            const first = await consumePoints(input);
            const replay = await consumePoints(input);

            await expect(consumePoints({ ...input, requestFingerprint: "b".repeat(64) })).rejects.toThrow("消费参数不一致");
            expect(first.applied).toBe(true);
            expect(replay.applied).toBe(false);
            expect(replay.record.id).toBe(first.record.id);
            expect(await repositories.points.getRecordByIdempotencyKey(idempotencyKey)).toMatchObject({ userId, requestFingerprint, amount: -5 });
        } finally {
            await repositories.users.delete(userId);
        }
    });

    postgresIt("persists decimal cost controls and serializes the site-wide daily budget", async () => {
        await ensurePostgresSchema();
        const repositories = createPostgresRepositories();
        const settings = await repositories.settings.getSettings();
        const storedSettings = settings.settings;
        const planId = storedSettings?.defaultPlanId || settings.plans[0]?.id;
        if (!storedSettings || !planId) throw new Error("PostgreSQL settings are unavailable for the integration test");

        const suffix = randomUUID();
        const userIds = [`test-cost-a-${suffix}`, `test-cost-b-${suffix}`];
        const now = new Date("2098-12-31T00:00:00.000Z");
        try {
            await repositories.settings.updateSettings({
                generationCostControl: {
                    maxPointsPerTask: 0,
                    dailyUserPointSpend: 0,
                    dailyTotalPointSpend: 1.7,
                },
                dataLifecycle: {
                    cleanupExpiredSessions: true,
                    cleanupExpiredEmailCodes: true,
                    cleanupExpiredGenerationTasks: true,
                    cleanupExpiredTemporaryMedia: true,
                    maintenanceBatchSize: 80,
                },
            });
            expect((await repositories.settings.getSettings()).settings).toMatchObject({
                dataLifecycle: {
                    cleanupExpiredSessions: true,
                    cleanupExpiredEmailCodes: true,
                    cleanupExpiredGenerationTasks: true,
                    cleanupExpiredTemporaryMedia: true,
                    maintenanceBatchSize: 80,
                },
                generationCostControl: {
                    maxPointsPerTask: 0,
                    dailyUserPointSpend: 0,
                    dailyTotalPointSpend: 1.7,
                },
            });

            await Promise.all(
                userIds.map((userId, index) =>
                    repositories.users.createWithNextAccountId({
                        id: userId,
                        username: `cost_${index}_${suffix.replaceAll("-", "").slice(0, 14)}`,
                        displayName: `成本并发测试用户 ${index + 1}`,
                        bio: "",
                        role: "user",
                        adminPermissions: [],
                        status: "active",
                        planId,
                        pointsBalance: 10,
                        passwordHash: "integration-test-only",
                        createdAt: now.toISOString(),
                        updatedAt: now.toISOString(),
                    }),
                ),
            );

            const results = await Promise.allSettled(
                userIds.map((userId, index) =>
                    consumePoints({
                        userId,
                        amount: 1.7,
                        units: 1,
                        usageKind: "text",
                        model: "writer",
                        description: "并发成本保护测试",
                        idempotencyKey: `cost-control:${index}:${suffix}`,
                        now,
                    }),
                ),
            );

            expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
            expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
            expect(results.find((result) => result.status === "rejected")).toMatchObject({
                reason: expect.objectContaining({ message: expect.stringContaining("平台今日生成成本保护已触发") }),
            });
        } finally {
            await Promise.all(userIds.map((userId) => repositories.users.delete(userId)));
            await repositories.settings.updateSettings({ generationCostControl: storedSettings.generationCostControl, dataLifecycle: storedSettings.dataLifecycle });
        }
    });

    postgresIt("deletes only one stable batch of isolated expired technical records", async () => {
        await ensurePostgresSchema();
        const repositories = createPostgresRepositories();
        const settings = await repositories.settings.getSettings();
        const planId = settings.settings?.defaultPlanId || settings.plans[0]?.id;
        if (!planId) throw new Error("No entitlement plan is available for the PostgreSQL integration test");

        const suffix = randomUUID();
        const userId = `test-lifecycle-${suffix}`;
        const createdAt = new Date("1950-01-01T00:00:00.000Z");
        const expiredAt = new Date("1960-01-01T00:00:00.000Z");
        const cutoff = new Date("1970-01-01T00:00:00.000Z");
        const activeUntil = new Date("2099-01-01T00:00:00.000Z");
        try {
            await repositories.users.createWithNextAccountId({
                id: userId,
                username: `lifecycle_${suffix.replaceAll("-", "").slice(0, 14)}`,
                displayName: "生命周期测试用户",
                bio: "",
                role: "user",
                adminPermissions: [],
                status: "active",
                planId,
                pointsBalance: 0,
                passwordHash: "integration-test-only",
                createdAt: createdAt.toISOString(),
                updatedAt: createdAt.toISOString(),
            });
            await Promise.all([
                ...["one", "two"].map((name) => repositories.sessions.create({ id: `lifecycle-session-${name}-${suffix}`, userId, tokenHash: `lifecycle-${name}-${suffix}`, createdAt: createdAt.toISOString(), expiresAt: expiredAt.toISOString() })),
                repositories.sessions.create({ id: `lifecycle-session-active-${suffix}`, userId, tokenHash: `lifecycle-active-${suffix}`, createdAt: createdAt.toISOString(), expiresAt: activeUntil.toISOString() }),
                ...["one", "two"].map((name) =>
                    repositories.emailCodes.create({
                        id: `lifecycle-code-${name}-${suffix}`,
                        purpose: "register",
                        email: `${name}-${suffix}@example.com`,
                        userId,
                        codeHash: name,
                        createdAt: createdAt.toISOString(),
                        expiresAt: expiredAt.toISOString(),
                        attempts: 0,
                    }),
                ),
            ]);
            await Promise.all(
                ["one", "two"].map((name) =>
                    postgresQuery(
                        `INSERT INTO generation_tasks (id, user_id, task_type, status, payload, created_at, updated_at, expires_at)
                         VALUES ($1, $2, 'text', 'success', '{}'::jsonb, $3, $3, $4)`,
                        [`lifecycle-task-${name}-${suffix}`, userId, createdAt.toISOString(), expiredAt.toISOString()],
                    ),
                ),
            );

            await expect(repositories.sessions.pruneExpired(cutoff, 1)).resolves.toBe(1);
            await expect(repositories.emailCodes.pruneExpired(cutoff, 1)).resolves.toBe(1);
            await expect(cleanupExpiredStoredGenerationTasks({ limit: 1, now: cutoff })).resolves.toBe(1);

            const [sessions, emailCodes, tasks] = await Promise.all([
                postgresQuery<{ count: string }>("SELECT count(*) FROM sessions WHERE user_id = $1", [userId]),
                postgresQuery<{ count: string }>("SELECT count(*) FROM email_codes WHERE user_id = $1", [userId]),
                postgresQuery<{ count: string }>("SELECT count(*) FROM generation_tasks WHERE user_id = $1", [userId]),
            ]);
            expect(Number(sessions.rows[0]?.count)).toBe(2);
            expect(Number(emailCodes.rows[0]?.count)).toBe(1);
            expect(Number(tasks.rows[0]?.count)).toBe(1);
        } finally {
            await repositories.users.delete(userId);
        }
    });
});
