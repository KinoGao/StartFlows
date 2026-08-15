import { afterEach, describe, expect, it, vi } from "vitest";

import type { QueryExecutor } from "@/lib/server/database";
import { POSTGRESQL_SCHEMA_SQL } from "@/lib/server/database/schema";
import { encryptSecretValue } from "@/lib/server/secret-crypto";
import { mapPostgresSettings, mutateAuthDb, readAuthDb, readPostgresAnnouncementsPage, readPostgresAuthSettings, readPostgresCdkListData, upsertPostgresSystemChannels } from "./store-repository";

const originalEncryptionKey = process.env.VOZEB_PRO_ENCRYPTION_KEY;
const originalDatabaseProvider = process.env.VOZEB_PRO_DATABASE_PROVIDER;

afterEach(() => {
    if (originalEncryptionKey === undefined) delete process.env.VOZEB_PRO_ENCRYPTION_KEY;
    else process.env.VOZEB_PRO_ENCRYPTION_KEY = originalEncryptionKey;
    if (originalDatabaseProvider === undefined) delete process.env.VOZEB_PRO_DATABASE_PROVIDER;
    else process.env.VOZEB_PRO_DATABASE_PROVIDER = originalDatabaseProvider;
});

function mockExecutor(rows: Record<string, unknown>[][]) {
    const query = vi.fn(async (_text: string, _values?: unknown[]) => ({ rows: rows.shift() || [], rowCount: 1 }));
    return { executor: { query } as unknown as QueryExecutor, query };
}

describe("PostgreSQL auth read paths", () => {
    it("rejects full-database auth mutations for PostgreSQL", async () => {
        process.env.VOZEB_PRO_DATABASE_PROVIDER = "postgres";

        await expect(mutateAuthDb(() => undefined)).rejects.toThrow("PostgreSQL auth mutations must use entity repositories");
    });

    it("rejects full-database auth reads outside the backup transaction", async () => {
        process.env.VOZEB_PRO_DATABASE_PROVIDER = "postgres";

        await expect(readAuthDb()).rejects.toThrow("PostgreSQL auth reads must use entity repositories");
    });

    it("normalizes newly added generation defaults for existing database rows", () => {
        const settings = mapPostgresSettings({ generation_defaults: { imageCount: 2 } }, [], []);

        expect(settings.generationDefaults).toMatchObject({
            imageCount: 2,
        });
    });

    it("normalizes persisted generation cost controls", () => {
        const settings = mapPostgresSettings({ generation_cost_control: { maxPointsPerTask: 1.7, dailyUserPointSpend: 20, dailyTotalPointSpend: 100 } }, [], []);

        expect(settings.generationCostControl).toEqual({ maxPointsPerTask: 1.7, dailyUserPointSpend: 20, dailyTotalPointSpend: 100 });
        expect(POSTGRESQL_SCHEMA_SQL).toContain("generation_cost_control jsonb");
    });

    it("normalizes persisted technical data lifecycle controls", () => {
        const settings = mapPostgresSettings({ data_lifecycle: { cleanupExpiredGenerationTasks: false, maintenanceBatchSize: 80 } }, [], []);

        expect(settings.dataLifecycle).toEqual({
            cleanupExpiredSessions: true,
            cleanupExpiredEmailCodes: true,
            cleanupExpiredGenerationTasks: false,
            cleanupExpiredTemporaryMedia: true,
            maintenanceBatchSize: 80,
        });
        expect(POSTGRESQL_SCHEMA_SQL).toContain("data_lifecycle jsonb");
    });

    it("fills missing fields in partial PostgreSQL settings JSON", () => {
        const settings = mapPostgresSettings({ mail: {}, generation_concurrency: {} }, [], []);

        expect(settings.mail).toMatchObject({
            host: "smtp.qq.com",
            username: "",
            password: "",
        });
        expect(settings.generationConcurrency).toMatchObject({
            agent: 2,
            image: 4,
            video: 1,
        });
    });

    it("decrypts system channel API keys and webhook secrets on the settings fast path", async () => {
        process.env.VOZEB_PRO_ENCRYPTION_KEY = "31".repeat(32);
        const encryptedApiKey = encryptSecretValue("provider-secret");
        const encryptedWebhookSecret = encryptSecretValue("0123456789abcdef0123456789abcdef");
        const { executor } = mockExecutor([
            [{ id: "default" }],
            [],
            [{ id: "channel-one", name: "主渠道", base_url: "https://api.example.com/v1", api_key_ciphertext: encryptedApiKey, webhook_secret_ciphertext: encryptedWebhookSecret, api_format: "openai", models: [], enabled: true }],
        ]);

        const settings = await readPostgresAuthSettings(executor);

        expect(settings.systemChannels[0].apiKey).toBe("provider-secret");
        expect(settings.systemChannels[0].apiKey).not.toContain("vozeb-pro-secret:v1:");
        expect(settings.systemChannels[0].webhookSecret).toBe("0123456789abcdef0123456789abcdef");
        expect(settings.systemChannels[0].webhookSecret).not.toContain("vozeb-pro-secret:v1:");
    });

    it("persists channel configuration without validation records", async () => {
        const { executor, query } = mockExecutor([[]]);
        await upsertPostgresSystemChannels(executor, [{ id: "channel-one", name: "主渠道", baseUrl: "https://api.example.com/v1", apiKey: "encrypted", webhookSecret: "encrypted-webhook", apiFormat: "openai", models: ["gpt-test"], enabled: true }]);
        const [statement, values] = query.mock.calls[0];
        expect(statement).not.toContain("health_results");
        expect(values?.[4]).toBe("encrypted-webhook");
        expect(values?.[9]).toBe(0);
        expect(POSTGRESQL_SCHEMA_SQL).not.toContain("health_results");
    });

    it("loads CDK codes without point records, sessions or unrelated users", async () => {
        const { executor, query } = mockExecutor([
            [{ total: 1 }],
            [{ total: 1, redeemed: 1, unused: 0, expired: 0 }],
            [
                {
                    id: "cdk-one",
                    status: "active",
                    code_hash: "hash",
                    code_ciphertext: "ciphertext",
                    code_preview: "CDK-ONE",
                    points: 20,
                    max_redemptions: 1,
                    redeemed_count: 1,
                    note: "测试",
                    created_at: "2026-01-01T00:00:00.000Z",
                    updated_at: "2026-01-01T00:00:00.000Z",
                    redemptions: [{ cdk_code_id: "cdk-one", user_id: "user-one", redeemed_at: "2026-01-01T00:00:00.000Z", account_id: 1, username: "user-one", display_name: "用户一" }],
                },
            ],
        ]);

        const data = await readPostgresCdkListData({ page: 1, pageSize: 20, filter: "all" }, executor);

        expect(data.cdkCodes[0]).toMatchObject({ id: "cdk-one", redeemedCount: 1 });
        expect(data.users).toEqual([{ id: "user-one", accountId: "0001", username: "user-one", displayName: "用户一" }]);
        expect(data.stats).toEqual({ total: 1, redeemed: 1, unused: 0, expired: 0 });
        expect(query).toHaveBeenCalledTimes(3);
        expect(query.mock.calls.map(([statement]) => String(statement))).toEqual([expect.stringContaining("count(*) AS total"), expect.stringContaining("count(*) FILTER"), expect.stringContaining("LIMIT $5 OFFSET $6")]);
    });

    it("filters and paginates announcements inside PostgreSQL", async () => {
        const visibleAt = "2026-07-27T00:00:00.000Z";
        const { executor, query } = mockExecutor([
            [
                {
                    id: "announcement-one",
                    title: "公告",
                    content: "内容",
                    enabled: true,
                    popup_home: false,
                    popup_after_login: false,
                    created_at: "2026-01-01T00:00:00.000Z",
                    updated_at: "2026-01-01T00:00:00.000Z",
                    total_count: "47",
                },
            ],
        ]);

        const page = await readPostgresAnnouncementsPage({ includeDisabled: false, page: 3, pageSize: 12, visibleAt }, executor);

        expect(page).toMatchObject({ items: [{ id: "announcement-one", title: "公告" }], total: 47, page: 3, pageSize: 12 });
        expect(query).toHaveBeenCalledWith(expect.stringMatching(/count\(\*\) OVER\(\)[\s\S]*WHERE[\s\S]*enabled = true[\s\S]*starts_at[\s\S]*ends_at[\s\S]*LIMIT \$3 OFFSET \$4/), [false, visibleAt, 12, 24]);
    });
});
