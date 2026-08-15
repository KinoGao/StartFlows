import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getPublicUsersByIds: vi.fn(),
    listPointRecordsPage: vi.fn(),
    listPrompts: vi.fn(),
    listCanvasProjectPage: vi.fn(),
    listCreativeAssets: vi.fn(),
    listCreativeConversations: vi.fn(),
    listCreativeMessages: vi.fn(),
    createPostgresRepositories: vi.fn(),
    ensurePostgresSchema: vi.fn(),
    isPostgresDatabaseEnabled: vi.fn(),
    getDramaProject: vi.fn(),
    listDramaProjectSummaries: vi.fn(),
    listGenerationLogs: vi.fn(),
    listLibraryAssetPage: vi.fn(),
    listLocalMediaRegistrationsForUserPage: vi.fn(),
    getOwnAccountDeletionRequest: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({ getPublicUsersByIds: mocks.getPublicUsersByIds, listPointRecordsPage: mocks.listPointRecordsPage }));
vi.mock("@/lib/prompts/store", () => ({ listPrompts: mocks.listPrompts }));
vi.mock("@/lib/server/canvas-project-store", () => ({ listCanvasProjectPage: mocks.listCanvasProjectPage }));
vi.mock("@/lib/server/creative-runtime-store", () => ({
    listCreativeAssets: mocks.listCreativeAssets,
    listCreativeConversations: mocks.listCreativeConversations,
    listCreativeMessages: mocks.listCreativeMessages,
}));
vi.mock("@/lib/server/database", () => ({
    createPostgresRepositories: mocks.createPostgresRepositories,
    ensurePostgresSchema: mocks.ensurePostgresSchema,
    isPostgresDatabaseEnabled: mocks.isPostgresDatabaseEnabled,
}));
vi.mock("@/lib/server/drama-project-store", () => ({ getDramaProject: mocks.getDramaProject, listDramaProjectSummaries: mocks.listDramaProjectSummaries }));
vi.mock("@/lib/server/generation-log-store", () => ({ listGenerationLogs: mocks.listGenerationLogs }));
vi.mock("@/lib/server/library-asset-store", () => ({ listLibraryAssetPage: mocks.listLibraryAssetPage }));
vi.mock("@/lib/server/local-media-registry", () => ({ listLocalMediaRegistrationsForUserPage: mocks.listLocalMediaRegistrationsForUserPage }));
vi.mock("@/lib/server/account-deletion-request-service", () => ({ getOwnAccountDeletionRequest: mocks.getOwnAccountDeletionRequest }));

import { buildUserDataExport, createUserDataExportStream } from "./user-data-export-service";

describe("buildUserDataExport", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.isPostgresDatabaseEnabled.mockReturnValue(false);
        mocks.getPublicUsersByIds.mockResolvedValue([{ id: "user-one", username: "one", displayName: "用户一", role: "user", status: "active" }]);
        mocks.listPointRecordsPage.mockResolvedValue({ records: [], total: 0 });
        mocks.listPrompts.mockResolvedValue({ items: [], total: 0 });
        mocks.listCanvasProjectPage.mockResolvedValue({ items: [], total: 0 });
        mocks.listCreativeConversations.mockResolvedValue([]);
        mocks.listCreativeAssets.mockResolvedValue([]);
        mocks.listCreativeMessages.mockResolvedValue([]);
        mocks.listDramaProjectSummaries.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
        mocks.listGenerationLogs.mockResolvedValue({ items: [], total: 0 });
        mocks.listLibraryAssetPage.mockResolvedValue({ items: [], total: 0 });
        mocks.listLocalMediaRegistrationsForUserPage.mockResolvedValue({ items: [], total: 0 });
        mocks.getOwnAccountDeletionRequest.mockResolvedValue(null);
    });

    it("exports only the requested user's portable records and strips sensitive fields", async () => {
        mocks.listPointRecordsPage
            .mockResolvedValueOnce({ records: [{ id: "point-1", userId: "user-one", amount: 1, idempotencyKey: "hidden" }], total: 2 })
            .mockResolvedValueOnce({ records: [{ id: "point-2", userId: "user-one", amount: -1 }], total: 2 });
        mocks.listPrompts.mockResolvedValue({ items: [{ id: "prompt-1", ownerUserId: "user-one", prompt: "用户提示词", dataUrl: "data:image/png;base64,AAAA" }], total: 1 });
        mocks.listCreativeConversations
            .mockResolvedValueOnce([{ id: "conversation-1", userId: "user-one", surface: "chat", source: "agent", title: "会话", status: "active", contextSummary: "内部摘要", createdAt: 1, updatedAt: 2, lastMessageAt: 2 }])
            .mockResolvedValueOnce([]);
        mocks.listCreativeMessages.mockResolvedValue([
            { id: "message-1", conversationId: "conversation-1", sequence: 1, role: "user", status: "completed", content: "用户输入", metadata: { workbenchPlan: { resolvedPrompt: "内部提示词" } }, createdAt: 1, updatedAt: 1 },
            { id: "message-2", conversationId: "conversation-1", sequence: 2, role: "system", status: "completed", content: "系统消息", metadata: {}, createdAt: 1, updatedAt: 1 },
        ]);
        mocks.listCreativeAssets.mockResolvedValue([
            {
                id: "asset-1",
                userId: "user-one",
                conversationId: "conversation-1",
                ordinal: 0,
                type: "image",
                status: "ready",
                title: "图片",
                serverUrl: "/api/reference-assets/user/image.png",
                remoteUrl: "https://provider.example/image.png",
                metadata: { planningPrompt: "hidden" },
                createdAt: 1,
                updatedAt: 1,
            },
        ]);
        mocks.listGenerationLogs.mockResolvedValue({
            items: [
                {
                    id: "log-1",
                    userId: "user-one",
                    username: "one",
                    displayName: "用户一",
                    kind: "image",
                    source: "agent",
                    status: "success",
                    title: "图片",
                    prompt: "用户提示词",
                    model: "image-model",
                    summary: "完成",
                    durationMs: 100,
                    count: 1,
                    successCount: 1,
                    failCount: 0,
                    assets: [{ type: "image", url: "/api/generation-log-assets/user/image.png", remoteUrl: "https://provider.example/image.png" }],
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                },
            ],
            total: 1,
        });
        mocks.listLocalMediaRegistrationsForUserPage.mockResolvedValue({ items: [{ storageKey: "user/image.png", ownerUserId: "user-one", externalObjectKey: "private/object.png", type: "image", source: "agent" }], total: 1 });
        mocks.getOwnAccountDeletionRequest.mockResolvedValue({ id: "delete-one", status: "pending", note: "不再使用", reviewNote: "", requestedAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });

        const result = await buildUserDataExport("user-one");

        expect(mocks.getPublicUsersByIds).toHaveBeenCalledWith(["user-one"]);
        expect(mocks.listLocalMediaRegistrationsForUserPage).toHaveBeenCalledWith("user-one", { page: 1, pageSize: 100 });
        expect(result.points).toEqual([
            { id: "point-1", amount: 1 },
            { id: "point-2", amount: -1 },
        ]);
        expect(result.prompts).toEqual([{ id: "prompt-1", prompt: "用户提示词" }]);
        expect(result.creative[0].conversation).not.toHaveProperty("contextSummary");
        expect(result.creative[0].messages).toHaveLength(1);
        expect(result.creative[0].messages[0]).not.toHaveProperty("metadata");
        expect(result.creative[0].assets[0]).toMatchObject({ serverUrl: "/api/reference-assets/user/image.png" });
        expect(result.creative[0].assets[0]).not.toHaveProperty("remoteUrl");
        expect(result.generationLogs[0]).not.toHaveProperty("userId");
        expect(result.generationLogs[0]).not.toHaveProperty("username");
        expect((result.generationLogs[0] as { assets: unknown[] }).assets[0]).not.toHaveProperty("remoteUrl");
        expect(result.media[0]).not.toHaveProperty("externalObjectKey");
        expect(result.accountDeletionRequest).toMatchObject({ id: "delete-one", status: "pending" });
    });

    it("reads billing pages by user in PostgreSQL and removes provider payload details", async () => {
        const billing = {
            listOrders: vi.fn().mockResolvedValue({ items: [{ id: "order-1", userId: "user-one", metadata: { checkout: { url: "secret" } }, providerPaymentId: "provider-payment" }], total: 1 }),
            listPayments: vi.fn().mockResolvedValue({ items: [{ id: "payment-1", userId: "user-one", rawPayload: { secret: true }, providerTradeId: "trade" }], total: 1 }),
            listPlanAssignments: vi.fn().mockResolvedValue({ items: [{ id: "assignment-1", userId: "user-one", sourceId: "order-1", metadata: { internal: true } }], total: 1 }),
        };
        const commercial = emptyCommercialRepositories();
        mocks.isPostgresDatabaseEnabled.mockReturnValue(true);
        mocks.createPostgresRepositories.mockReturnValue({ billing, ...commercial });

        const result = await buildUserDataExport("user-one");

        expect(billing.listOrders).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-one" }));
        expect(billing.listPayments).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-one" }));
        expect(billing.listPlanAssignments).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-one" }));
        expect(result.billing.orders).toEqual([{ id: "order-1" }]);
        expect(result.billing.payments).toEqual([{ id: "payment-1" }]);
        expect(result.billing.planAssignments).toEqual([{ id: "assignment-1" }]);
    });

    it("includes coupons, referral relationships, works and notifications without internal risk fields", async () => {
        const repositories = emptyCommercialRepositories();
        repositories.coupons.listUserCoupons.mockResolvedValue({ items: [{ id: "coupon-one", userId: "user-one", status: "available" }], total: 1 });
        repositories.referrals.listRelationships.mockResolvedValue({ items: [{ id: "relationship-one", inviterUserId: "user-one", paymentIdentityHash: "hidden", riskSignals: ["hidden"] }], total: 1 });
        repositories.referrals.listRewards.mockResolvedValue({ items: [{ id: "reward-one", beneficiaryUserId: "user-one", pointsAmount: 20 }], total: 1 });
        repositories.workPublications.listWorks.mockResolvedValue({ items: [{ id: "work-one" }], total: 1 });
        repositories.workPublications.getWorkById.mockResolvedValue({ id: "work-one", ownerUserId: "user-one" });
        repositories.workPublications.listVersionsByWork.mockResolvedValue([{ id: "version-one", workId: "work-one", moderationSignal: { secret: true } }]);
        repositories.workPublications.listVersionAssets.mockResolvedValue([{ id: "asset-one", versionId: "version-one", metadata: { prompt: "internal" } }]);
        repositories.workCommunity.listNotifications.mockResolvedValue({ items: [{ id: "notification-one", createdAt: "2026-08-01T00:00:00.000Z", summary: "收到点赞" }], hasMore: false });
        mocks.isPostgresDatabaseEnabled.mockReturnValue(true);
        mocks.createPostgresRepositories.mockReturnValue({ billing: emptyBillingRepository(), ...repositories });

        const result = await buildUserDataExport("user-one");
        const commercial = result.commercial as Record<string, Array<Record<string, unknown>>>;

        expect(repositories.referrals.listRelationships).toHaveBeenCalledWith(expect.objectContaining({ participantUserId: "user-one" }));
        expect(commercial.coupons[0]).toMatchObject({ id: "coupon-one" });
        expect(commercial.referralRelationships[0]).not.toHaveProperty("paymentIdentityHash");
        expect(commercial.referralRelationships[0]).not.toHaveProperty("riskSignals");
        expect(JSON.stringify(commercial.works[0])).not.toContain("moderationSignal");
        expect(commercial.notifications[0]).toMatchObject({ id: "notification-one" });
    });

    it("streams a valid JSON export without buffering every section into the route", async () => {
        const stream = await createUserDataExportStream("user-one");
        const payload = JSON.parse(await new Response(stream).text());

        expect(payload).toMatchObject({ format: "vozeb-pro-personal-data", version: 1, account: { id: "user-one" } });
        expect(payload).toHaveProperty("generationLogs");
        expect(payload).toHaveProperty("commercial");
        expect(payload.exclusions).toContain("密码、会话、验证码和 API 凭据");
    });

    it("collects every Drama summary page before reading owned project details", async () => {
        mocks.listDramaProjectSummaries.mockResolvedValueOnce({ items: [{ id: "drama-one" }], total: 2, page: 1, pageSize: 100 }).mockResolvedValueOnce({ items: [{ id: "drama-two" }], total: 2, page: 2, pageSize: 100 });
        mocks.getDramaProject.mockImplementation(async (id: string) => ({ id, title: id }));

        const result = await buildUserDataExport("user-one");

        expect(mocks.listDramaProjectSummaries).toHaveBeenNthCalledWith(1, "user-one", { page: 1, pageSize: 100 });
        expect(mocks.listDramaProjectSummaries).toHaveBeenNthCalledWith(2, "user-one", { page: 2, pageSize: 100 });
        expect(result.dramaProjects).toEqual([
            { id: "drama-one", title: "drama-one" },
            { id: "drama-two", title: "drama-two" },
        ]);
    });

    it("collects Canvas, library, and media export data through user-scoped pages", async () => {
        mocks.listCanvasProjectPage.mockResolvedValueOnce({ items: [{ id: "canvas-one" }], total: 2 }).mockResolvedValueOnce({ items: [{ id: "canvas-two" }], total: 2 });
        mocks.listLibraryAssetPage.mockResolvedValueOnce({ items: [{ id: "asset-one" }], total: 2 }).mockResolvedValueOnce({ items: [{ id: "asset-two" }], total: 2 });
        mocks.listLocalMediaRegistrationsForUserPage.mockResolvedValueOnce({ items: [{ storageKey: "one.png", ownerUserId: "user-one" }], total: 2 }).mockResolvedValueOnce({ items: [{ storageKey: "two.png", ownerUserId: "user-one" }], total: 2 });

        const result = await buildUserDataExport("user-one");

        expect(mocks.listCanvasProjectPage).toHaveBeenNthCalledWith(1, "user-one", { page: 1, pageSize: 100 });
        expect(mocks.listCanvasProjectPage).toHaveBeenNthCalledWith(2, "user-one", { page: 2, pageSize: 100 });
        expect(mocks.listLibraryAssetPage).toHaveBeenNthCalledWith(2, "user-one", { page: 2, pageSize: 100 });
        expect(mocks.listLocalMediaRegistrationsForUserPage).toHaveBeenNthCalledWith(2, "user-one", { page: 2, pageSize: 100 });
        expect(result.canvasProjects).toEqual([{ id: "canvas-one" }, { id: "canvas-two" }]);
        expect(result.libraryAssets).toEqual([{ id: "asset-one" }, { id: "asset-two" }]);
        expect(result.media).toEqual([{ storageKey: "one.png" }, { storageKey: "two.png" }]);
    });
});

function emptyBillingRepository() {
    return {
        listOrders: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        listPayments: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        listPlanAssignments: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    };
}

function emptyCommercialRepositories() {
    return {
        coupons: { listUserCoupons: vi.fn().mockResolvedValue({ items: [], total: 0 }) },
        referrals: {
            listRelationships: vi.fn().mockResolvedValue({ items: [], total: 0 }),
            listRewards: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        },
        workPublications: {
            listWorks: vi.fn().mockResolvedValue({ items: [], total: 0 }),
            getWorkById: vi.fn(),
            listVersionsByWork: vi.fn().mockResolvedValue([]),
            listVersionAssets: vi.fn().mockResolvedValue([]),
        },
        workCommunity: { listNotifications: vi.fn().mockResolvedValue({ items: [], hasMore: false }) },
    };
}
