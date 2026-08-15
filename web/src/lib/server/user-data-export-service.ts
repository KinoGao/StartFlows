import { getPublicUsersByIds, listPointRecordsPage } from "@/lib/auth/store";
import { listPrompts } from "@/lib/prompts/store";
import { listCanvasProjectPage } from "@/lib/server/canvas-project-store";
import { listCreativeAssets, listCreativeConversations, listCreativeMessages } from "@/lib/server/creative-runtime-store";
import { createPostgresRepositories, ensurePostgresSchema, isPostgresDatabaseEnabled } from "@/lib/server/database";
import { getDramaProject, listDramaProjectSummaries } from "@/lib/server/drama-project-store";
import { listGenerationLogs } from "@/lib/server/generation-log-store";
import { listLibraryAssetPage } from "@/lib/server/library-asset-store";
import { listLocalMediaRegistrationsForUserPage } from "@/lib/server/local-media-registry";
import { getOwnAccountDeletionRequest } from "@/lib/server/account-deletion-request-service";
import { sanitizePortableData } from "@/lib/server/user-data-export-policy";

const PAGE_SIZE = 100;
const CONVERSATION_PAGE_SIZE = 200;
const EXPORT_EXCLUSIONS = ["媒体二进制与 base64 内容", "密码、会话、验证码和 API 凭据", "支付商原始回调载荷", "临时签名地址与对象存储内部路径", "平台内部规划与模型选择详情"];

export async function buildUserDataExport(userId: string) {
    const [account, points, billing, commercial, prompts, creative, generationLogs, canvasProjects, libraryAssets, dramaProjects, media, accountDeletionRequest] = await Promise.all([
        readExportAccount(userId),
        readPointsExportData(userId),
        readBillingExportData(userId),
        readCommercialData(userId),
        readPromptsExportData(userId),
        readCreativeData(userId),
        readGenerationLogsExportData(userId),
        readCanvasProjectsExportData(userId),
        readLibraryAssetsExportData(userId),
        readDramaProjects(userId).then(sanitizePortableData),
        readMediaExportData(userId),
        getOwnAccountDeletionRequest(userId),
    ]);
    if (!account) throw new Error("Personal data export user does not exist");

    return {
        format: "vozeb-pro-personal-data",
        version: 1,
        exportedAt: new Date().toISOString(),
        account,
        points,
        billing,
        commercial,
        prompts,
        creative,
        generationLogs,
        canvasProjects,
        libraryAssets,
        dramaProjects,
        media,
        accountDeletionRequest,
        exclusions: EXPORT_EXCLUSIONS,
    };
}

export async function createUserDataExportStream(userId: string) {
    const account = await readExportAccount(userId);
    if (!account) throw new Error("Personal data export user does not exist");
    const exportedAt = new Date().toISOString();
    const sections: Array<[string, () => Promise<unknown>]> = [
        ["points", () => readPointsExportData(userId)],
        ["billing", () => readBillingExportData(userId)],
        ["commercial", () => readCommercialData(userId)],
        ["prompts", () => readPromptsExportData(userId)],
        ["creative", () => readCreativeData(userId)],
        ["generationLogs", () => readGenerationLogsExportData(userId)],
        ["canvasProjects", () => readCanvasProjectsExportData(userId)],
        ["libraryAssets", () => readLibraryAssetsExportData(userId)],
        ["dramaProjects", () => readDramaProjects(userId).then(sanitizePortableData)],
        ["media", () => readMediaExportData(userId)],
        ["accountDeletionRequest", () => getOwnAccountDeletionRequest(userId)],
    ];
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
        async start(controller) {
            try {
                controller.enqueue(encoder.encode(`{"format":"vozeb-pro-personal-data","version":1,"exportedAt":${JSON.stringify(exportedAt)},"account":${JSON.stringify(account)}`));
                for (const [name, load] of sections) controller.enqueue(encoder.encode(`,${JSON.stringify(name)}:${JSON.stringify(await load())}`));
                controller.enqueue(encoder.encode(`,"exclusions":${JSON.stringify(EXPORT_EXCLUSIONS)}}`));
                controller.close();
            } catch (error) {
                controller.error(error);
            }
        },
    });
}

async function readExportAccount(userId: string) {
    return getPublicUsersByIds([userId]).then((users) => users[0] || null);
}

async function readPointsExportData(userId: string) {
    const points = await collectPages((page) => listPointRecordsPage(userId, { page, pageSize: 50 }).then((result) => ({ items: result.records, total: result.total })));
    return points.map(({ userId: _userId, idempotencyKey: _idempotencyKey, sourceRecordId: _sourceRecordId, ...record }) => record);
}

async function readBillingExportData(userId: string) {
    const billing = await readBillingData(userId);
    return {
        orders: billing.orders.map(({ userId: _userId, metadata: _metadata, providerOrderId: _providerOrderId, providerPaymentId: _providerPaymentId, ...order }) => order),
        payments: billing.payments.map(({ userId: _userId, rawPayload: _rawPayload, providerTradeId: _providerTradeId, providerPaymentId: _providerPaymentId, ...payment }) => payment),
        planAssignments: billing.planAssignments.map(({ userId: _userId, metadata: _metadata, sourceId: _sourceId, ...assignment }) => assignment),
    };
}

async function readPromptsExportData(userId: string) {
    const prompts = await collectPages((page) => listPrompts({ scope: "user", ownerUserId: userId, page, pageSize: PAGE_SIZE }));
    return prompts.map(({ ownerUserId: _ownerUserId, ...prompt }) => sanitizePortableData(prompt));
}

async function readGenerationLogsExportData(userId: string) {
    const logs = await collectPages((page) => listGenerationLogs({ userId, page, pageSize: PAGE_SIZE }));
    return logs.map((log) =>
        sanitizePortableData({
            id: log.id,
            conversationId: log.conversationId,
            kind: log.kind,
            source: log.source,
            status: log.status,
            title: log.title,
            prompt: log.prompt,
            model: log.model,
            summary: log.summary,
            durationMs: log.durationMs,
            count: log.count,
            successCount: log.successCount,
            failCount: log.failCount,
            assets: log.assets,
            taskId: log.taskId,
            error: log.error,
            createdAt: log.createdAt,
            updatedAt: log.updatedAt,
            completedAt: log.completedAt,
        }),
    );
}

async function readCanvasProjectsExportData(userId: string) {
    return collectPages((page) => listCanvasProjectPage(userId, { page, pageSize: PAGE_SIZE })).then(sanitizePortableData);
}

async function readLibraryAssetsExportData(userId: string) {
    return collectPages((page) => listLibraryAssetPage(userId, { page, pageSize: PAGE_SIZE })).then(sanitizePortableData);
}

async function readMediaExportData(userId: string) {
    const media = await collectPages((page) => listLocalMediaRegistrationsForUserPage(userId, { page, pageSize: PAGE_SIZE }));
    return media.map(({ ownerUserId: _ownerUserId, externalStorageId: _externalStorageId, externalObjectKey: _externalObjectKey, ...item }) => item);
}

async function readCommercialData(userId: string) {
    if (!isPostgresDatabaseEnabled()) return { coupons: [], referralRelationships: [], referralRewards: [], works: [], notifications: [] };
    await ensurePostgresSchema();
    const repos = createPostgresRepositories();
    const [coupons, referralRelationships, referralRewards, workSummaries, notifications] = await Promise.all([
        collectPages((page) => repos.coupons.listUserCoupons(userId, { page, pageSize: PAGE_SIZE })),
        collectPages((page) => repos.referrals.listRelationships({ participantUserId: userId, page, pageSize: PAGE_SIZE })),
        collectPages((page) => repos.referrals.listRewards({ beneficiaryUserId: userId, page, pageSize: PAGE_SIZE })),
        collectPages((page) => repos.workPublications.listWorks({ ownerUserId: userId, page, pageSize: PAGE_SIZE })),
        readAllNotifications(repos.workCommunity, userId),
    ]);
    const works = await mapInBatches(workSummaries, 6, async (summary) => {
        const [work, versions] = await Promise.all([repos.workPublications.getWorkById(summary.id, userId), repos.workPublications.listVersionsByWork(summary.id)]);
        return {
            work,
            versions: await mapInBatches(versions, 8, async (version) => ({ version, assets: await repos.workPublications.listVersionAssets(version.id) })),
        };
    });
    return sanitizePortableData({ coupons, referralRelationships, referralRewards, works, notifications });
}

async function readBillingData(userId: string) {
    if (!isPostgresDatabaseEnabled()) return { orders: [], payments: [], planAssignments: [] };
    await ensurePostgresSchema();
    const billing = createPostgresRepositories().billing;
    const [orders, payments, planAssignments] = await Promise.all([
        collectPages((page) => billing.listOrders({ userId, page, pageSize: PAGE_SIZE })),
        collectPages((page) => billing.listPayments({ userId, page, pageSize: PAGE_SIZE })),
        collectPages((page) => billing.listPlanAssignments({ userId, page, pageSize: PAGE_SIZE })),
    ]);
    return { orders, payments, planAssignments };
}

async function readCreativeData(userId: string) {
    const conversations = await collectOffsetPages((offset) => listCreativeConversations(userId, { limit: CONVERSATION_PAGE_SIZE, offset }));
    return mapInBatches(conversations, 8, async (conversation) => ({
        conversation: {
            id: conversation.id,
            surface: conversation.surface,
            source: conversation.source,
            projectId: conversation.projectId,
            title: conversation.title,
            status: conversation.status,
            createdAt: conversation.createdAt,
            updatedAt: conversation.updatedAt,
            lastMessageAt: conversation.lastMessageAt,
        },
        messages: (await readAllCreativeMessages(conversation.id)).filter((message) => message.role === "user" || message.role === "assistant").map(({ metadata: _metadata, ...message }) => message),
        assets: (await listCreativeAssets(conversation.id, userId)).map(({ userId: _userId, remoteUrl: _remoteUrl, metadata: _metadata, ...asset }) => sanitizePortableData(asset)),
    }));
}

async function readAllCreativeMessages(conversationId: string) {
    let beforeSequence = 0;
    let messages: Awaited<ReturnType<typeof listCreativeMessages>> = [];
    while (true) {
        const page = await listCreativeMessages(conversationId, 0, CONVERSATION_PAGE_SIZE, beforeSequence);
        messages = [...page, ...messages];
        if (page.length < CONVERSATION_PAGE_SIZE || !page[0]?.sequence) return messages;
        beforeSequence = page[0].sequence;
    }
}

async function readDramaProjects(userId: string) {
    const summaries = await collectPages((page) => listDramaProjectSummaries(userId, { page, pageSize: PAGE_SIZE }));
    return (await mapInBatches(summaries, 8, async (summary) => getDramaProject(summary.id, userId))).filter((project) => project !== null);
}

async function readAllNotifications(repository: ReturnType<typeof createPostgresRepositories>["workCommunity"], userId: string) {
    const items = [];
    let after: { createdAt: string; id: string } | undefined;
    while (true) {
        const page = await repository.listNotifications(userId, { limit: 50, after });
        items.push(...page.items);
        const last = page.items.at(-1);
        if (!page.hasMore || !last?.createdAt || !last.id) return items;
        after = { createdAt: last.createdAt, id: last.id };
    }
}

async function collectPages<T>(load: (page: number) => Promise<{ items: T[]; total: number }>) {
    const items: T[] = [];
    for (let page = 1; ; page += 1) {
        const result = await load(page);
        items.push(...result.items);
        if (!result.items.length || items.length >= result.total) return items;
    }
}

async function collectOffsetPages<T>(load: (offset: number) => Promise<T[]>) {
    const items: T[] = [];
    while (true) {
        const page = await load(items.length);
        items.push(...page);
        if (page.length < CONVERSATION_PAGE_SIZE) return items;
    }
}

async function mapInBatches<T, R>(items: T[], batchSize: number, mapper: (item: T) => Promise<R>) {
    const result: R[] = [];
    for (let index = 0; index < items.length; index += batchSize) result.push(...(await Promise.all(items.slice(index, index + batchSize).map(mapper))));
    return result;
}
