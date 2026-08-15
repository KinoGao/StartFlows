import { randomUUID } from "node:crypto";

import {
    createPostgresRepositories,
    ensurePostgresSchema,
    getDatabaseProvider,
    withPostgresTransaction,
    type PublishedWorkAssetRecord,
    type PublishedWorkAuthorDisplay,
    type PublishedWorkRecord,
    type PublishedWorkSourceType,
    type PublishedWorkSummaryRecord,
    type PublishedWorkVersionRecord,
    type PublishedWorkVisibility,
} from "@/lib/server/database";
import { collectLocalMediaStorageKeys } from "@/lib/server/local-media-references";
import { getLocalMediaRegistration, getLocalMediaRegistrations, type LocalMediaRegistration } from "@/lib/server/local-media-registry";
import { moderateWorkContent } from "@/lib/server/work-content-moderation";
import { userAvatarUrl } from "@/lib/user-avatar";

type WorkPublicationRepositories = ReturnType<typeof createPostgresRepositories>;

export type WorkPublicationDraftInput = {
    sourceType?: unknown;
    sourceId?: unknown;
    title?: unknown;
    description?: unknown;
    publicPrompt?: unknown;
    category?: unknown;
    tags?: unknown;
    visibility?: unknown;
    authorDisplay?: unknown;
    authorName?: unknown;
    assetStorageKeys?: unknown;
    coverStorageKey?: unknown;
};

export type WorkPublicationMediaCandidate = {
    storageKey: string;
    mediaType: "image" | "video" | "audio";
    mimeType: string;
    originalName: string;
    bytes: number;
    previewUrl: string;
};

export class WorkPublicationServiceError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
        this.name = "WorkPublicationServiceError";
    }
}

export async function listWorkPublicationSources(userId: string, input: { sourceType?: unknown; page?: number; pageSize?: number; keyword?: unknown }) {
    await assertWorkPublicationReady();
    return createPostgresRepositories().workPublications.listSourceSummaries(requiredId(userId, "用户"), {
        sourceType: requiredSourceType(input.sourceType),
        page: input.page,
        pageSize: input.pageSize,
        keyword: typeof input.keyword === "string" ? input.keyword.trim() : undefined,
    });
}

export async function getWorkPublicationSource(userId: string, sourceTypeValue: unknown, sourceIdValue: unknown) {
    await assertWorkPublicationReady();
    const sourceType = requiredSourceType(sourceTypeValue);
    const sourceId = requiredId(sourceIdValue, "来源");
    return resolveSource(createPostgresRepositories(), requiredId(userId, "用户"), sourceType, sourceId);
}

export async function listWorkPublicationsForUser(userId: string, input: { page?: number; pageSize?: number; status?: unknown; keyword?: unknown } = {}) {
    await assertWorkPublicationReady();
    const status = moderationStatus(input.status);
    const takenDown = status === "taken_down";
    return createPostgresRepositories().workPublications.listWorks({
        ownerUserId: requiredId(userId, "用户"),
        moderationStatus: takenDown ? undefined : status,
        lifecycleStatus: status && !takenDown ? "active" : undefined,
        userStatus: takenDown ? "taken_down" : undefined,
        keyword: text(input.keyword, 100),
        page: input.page,
        pageSize: input.pageSize,
    });
}

export async function listWorkPublicationsForAdmin(input: { page?: number; pageSize?: number; status?: unknown; lifecycleStatus?: unknown; keyword?: unknown } = {}) {
    await assertWorkPublicationReady();
    const status = moderationStatus(input.status);
    const takenDown = status === "taken_down";
    const page = await createPostgresRepositories().workPublications.listWorks({
        moderationStatus: takenDown ? undefined : status,
        lifecycleStatus: takenDown
            ? input.lifecycleStatus === "active" || input.lifecycleStatus === "revoked"
                ? input.lifecycleStatus
                : undefined
            : status
              ? "active"
              : input.lifecycleStatus === "active" || input.lifecycleStatus === "revoked"
                ? input.lifecycleStatus
                : undefined,
        userStatus: takenDown ? "taken_down" : undefined,
        keyword: text(input.keyword, 100),
        page: input.page,
        pageSize: input.pageSize,
    });
    const registrations = await getLocalMediaRegistrations(page.items.flatMap((work) => (work.currentPreview ? [work.currentPreview.storageKey] : [])));
    const registrationByKey = new Map(registrations.map((registration) => [registration.storageKey, registration]));
    return {
        ...page,
        items: page.items.map((work) => {
            if (!work.currentPreview) return work;
            const registration = registrationByKey.get(work.currentPreview.storageKey);
            return { ...work, currentPreview: { ...work.currentPreview, previewUrl: registration ? privateAssetUrl(registration) : undefined } };
        }),
    };
}

export async function getWorkPublicationForUser(userId: string, workIdValue: unknown) {
    await assertWorkPublicationReady();
    const repos = createPostgresRepositories();
    const work = await repos.workPublications.getWorkSummaryById(requiredId(workIdValue, "作品"), requiredId(userId, "用户"));
    if (!work) throw new WorkPublicationServiceError("作品不存在", 404);
    return loadWorkDetail(repos, work);
}

export async function createWorkPublicationDraft(userIdValue: unknown, input: WorkPublicationDraftInput) {
    await assertWorkPublicationReady();
    const userId = requiredId(userIdValue, "用户");
    const sourceType = requiredSourceType(input.sourceType);
    const sourceId = requiredId(input.sourceId, "来源");

    return withPostgresTransaction(async (client) => {
        const repos = createPostgresRepositories(client);
        const [source, user] = await Promise.all([resolveSource(repos, userId, sourceType, sourceId), repos.users.getById(userId)]);
        if (!user || user.status !== "active") throw new WorkPublicationServiceError("用户不可用", 403);
        const draft = normalizeDraft(input, source.title, user, undefined, source.candidates);
        const now = new Date().toISOString();
        const workId = randomUUID();
        const versionId = randomUUID();
        const work: PublishedWorkRecord = {
            id: workId,
            ownerUserId: userId,
            slug: publicationSlug(),
            sourceType,
            sourceId,
            lifecycleStatus: "active",
            isFeatured: false,
            viewCount: 0,
            likeCount: 0,
            createdAt: now,
            updatedAt: now,
        };
        const version = publicationVersion(versionId, workId, 1, draft, now);
        await repos.workPublications.createWork(work);
        await repos.workPublications.createVersion(version);
        const assets = await repos.workPublications.replaceVersionAssets(versionId, publicationAssets(versionId, draft, source.candidates, now));
        if (!(await repos.workPublications.setCurrentVersion(workId, versionId))) throw new WorkPublicationServiceError("作品版本保存失败", 409);
        return { ...(await requiredWorkDetail(repos, workId, userId)), currentAssets: assets };
    });
}

export async function updateWorkPublicationDraft(userIdValue: unknown, workIdValue: unknown, input: WorkPublicationDraftInput) {
    await assertWorkPublicationReady();
    const userId = requiredId(userIdValue, "用户");
    const workId = requiredId(workIdValue, "作品");

    return withPostgresTransaction(async (client) => {
        const repos = createPostgresRepositories(client);
        const work = await repos.workPublications.getWorkById(workId, userId, true);
        if (!work) throw new WorkPublicationServiceError("作品不存在", 404);
        if (work.lifecycleStatus !== "active") throw new WorkPublicationServiceError("作品已下架，不能继续编辑", 409);
        if (!work.currentVersionId) throw new WorkPublicationServiceError("作品当前版本不存在", 409);

        const current = await repos.workPublications.getVersionById(work.currentVersionId, true);
        if (!current || current.workId !== work.id) throw new WorkPublicationServiceError("作品版本不存在", 409);
        if (current.moderationStatus === "pending") throw new WorkPublicationServiceError("作品正在审核，不能编辑", 409);

        const [source, user, existingAssets] = await Promise.all([resolveSource(repos, userId, work.sourceType, work.sourceId), repos.users.getById(userId), repos.workPublications.listVersionAssets(current.id)]);
        if (!user || user.status !== "active") throw new WorkPublicationServiceError("用户不可用", 403);
        const draft = normalizeDraft(input, source.title, user, { version: current, assets: existingAssets }, source.candidates);
        const now = new Date().toISOString();
        let version: PublishedWorkVersionRecord;

        if (current.moderationStatus === "draft" || current.moderationStatus === "rejected") {
            const updated = await repos.workPublications.updateDraftVersion({ ...current, ...draft.versionFields, updatedAt: now });
            if (!updated) throw new WorkPublicationServiceError("作品版本状态已变化，请刷新后重试", 409);
            version = updated;
        } else {
            version = publicationVersion(randomUUID(), work.id, await repos.workPublications.getNextVersionNumber(work.id), draft, now);
            version = await repos.workPublications.createVersion(version);
            if (!(await repos.workPublications.setCurrentVersion(work.id, version.id))) throw new WorkPublicationServiceError("作品版本切换失败", 409);
        }

        const currentAssets = await repos.workPublications.replaceVersionAssets(version.id, publicationAssets(version.id, draft, source.candidates, now));
        return { ...(await requiredWorkDetail(repos, work.id, userId)), currentAssets };
    });
}

export async function submitWorkPublication(userIdValue: unknown, workIdValue: unknown) {
    await assertWorkPublicationReady();
    const userId = requiredId(userIdValue, "用户");
    const workId = requiredId(workIdValue, "作品");
    const preview = await createPostgresRepositories().workPublications.getWorkSummaryById(workId, userId);
    if (!preview?.currentVersion) throw new WorkPublicationServiceError("作品不存在", 404);
    const previewVersion = preview.currentVersion;
    if (!text(previewVersion.publicPrompt, 8000)) throw new WorkPublicationServiceError("请填写公开提示词");
    const moderation =
        previewVersion.moderationStatus === "draft" || previewVersion.moderationStatus === "rejected"
            ? await moderateWorkContent({ title: previewVersion.title, description: previewVersion.description, publicPrompt: previewVersion.publicPrompt, category: previewVersion.category, tags: previewVersion.tags })
            : undefined;

    return withPostgresTransaction(async (client) => {
        const repos = createPostgresRepositories(client);
        const work = await repos.workPublications.getWorkById(workId, userId, true);
        if (!work) throw new WorkPublicationServiceError("作品不存在", 404);
        if (work.lifecycleStatus !== "active") throw new WorkPublicationServiceError("作品已下架", 409);
        if (!work.currentVersionId) throw new WorkPublicationServiceError("作品当前版本不存在", 409);
        const version = await repos.workPublications.getVersionById(work.currentVersionId, true);
        if (!version || version.workId !== work.id) throw new WorkPublicationServiceError("作品版本不存在", 409);
        if (version.moderationStatus === "pending" || version.moderationStatus === "approved") return requiredWorkDetail(repos, work.id, userId);
        if (version.moderationStatus === "taken_down") throw new WorkPublicationServiceError("下架版本需要先编辑再提交", 409);
        if (moderation && version.id !== previewVersion.id) throw new WorkPublicationServiceError("作品版本已变化，请刷新后重试", 409);
        if (!(await repos.workPublications.listVersionAssets(version.id)).some((asset) => asset.role === "content")) throw new WorkPublicationServiceError("作品没有可发布媒体", 409);
        if (moderation && !(await repos.workPublications.setModerationSignal(version.id, moderation.provider, moderation.signal))) throw new WorkPublicationServiceError("内容审核信号保存失败", 409);
        if (!(await repos.workPublications.submitVersion(version.id, new Date().toISOString()))) throw new WorkPublicationServiceError("作品状态已变化，请刷新后重试", 409);
        return requiredWorkDetail(repos, work.id, userId);
    });
}

export async function revokeWorkPublication(userIdValue: unknown, workIdValue: unknown) {
    await assertWorkPublicationReady();
    const userId = requiredId(userIdValue, "用户");
    const workId = requiredId(workIdValue, "作品");
    return withPostgresTransaction(async (client) => {
        const repos = createPostgresRepositories(client);
        const work = await repos.workPublications.getWorkById(workId, userId, true);
        if (!work) throw new WorkPublicationServiceError("作品不存在", 404);
        if (work.lifecycleStatus === "revoked") return requiredWorkDetail(repos, work.id, userId);
        if (!(await repos.workPublications.revokeWork(work.id, new Date().toISOString()))) throw new WorkPublicationServiceError("作品状态已变化，请刷新后重试", 409);
        return requiredWorkDetail(repos, work.id, userId);
    });
}

export async function relistWorkPublication(userIdValue: unknown, workIdValue: unknown) {
    await assertWorkPublicationReady();
    const userId = requiredId(userIdValue, "用户");
    const workId = requiredId(workIdValue, "作品");
    return withPostgresTransaction(async (client) => {
        const repos = createPostgresRepositories(client);
        const work = await repos.workPublications.getWorkById(workId, userId, true);
        if (!work) throw new WorkPublicationServiceError("作品不存在", 404);
        if (work.lifecycleStatus !== "revoked") throw new WorkPublicationServiceError(work.publishedVersionId ? "作品已经上架" : "该作品需要重新审核后才能上架", 409);
        const version = await repos.workPublications.getLatestApprovedPublicVersion(work.id, true);
        if (!version) throw new WorkPublicationServiceError("没有可重新上架的已通过版本", 409);
        if (!(await repos.workPublications.relistWork(work.id, version.id))) throw new WorkPublicationServiceError("作品状态已变化，请刷新后重试", 409);
        return requiredWorkDetail(repos, work.id, userId);
    });
}

export async function deleteWorkPublicationForUser(userIdValue: unknown, workIdValue: unknown) {
    await assertWorkPublicationReady();
    const userId = requiredId(userIdValue, "用户");
    const workId = requiredId(workIdValue, "作品");
    return withPostgresTransaction(async (client) => {
        const repos = createPostgresRepositories(client);
        const work = await repos.workPublications.getWorkById(workId, userId, true);
        if (!work) throw new WorkPublicationServiceError("作品不存在", 404);
        if (work.lifecycleStatus !== "revoked") throw new WorkPublicationServiceError("请先下架作品再删除", 409);
        const version = work.currentVersionId ? await repos.workPublications.getVersionById(work.currentVersionId) : null;
        if (!(await repos.workPublications.deleteWorkCompletely(work.id))) throw new WorkPublicationServiceError("作品删除失败，请刷新后重试", 409);
        return { id: work.id, title: version?.title || "" };
    });
}

export async function deleteWorkPublicationForAdmin(adminUserIdValue: unknown, workIdValue: unknown) {
    await assertWorkPublicationReady();
    requiredId(adminUserIdValue, "管理员");
    const workId = requiredId(workIdValue, "作品");
    return withPostgresTransaction(async (client) => {
        const repos = createPostgresRepositories(client);
        const work = await repos.workPublications.getWorkById(workId, undefined, true);
        if (!work) throw new WorkPublicationServiceError("作品不存在", 404);
        const deletable = work.lifecycleStatus === "revoked" || (!work.publishedVersionId && (await repos.workPublications.hasTakenDownVersion(work.id)));
        if (!deletable) throw new WorkPublicationServiceError("请先下架作品再删除", 409);
        const version = work.currentVersionId ? await repos.workPublications.getVersionById(work.currentVersionId) : null;
        if (!(await repos.workPublications.deleteWorkCompletely(work.id))) throw new WorkPublicationServiceError("作品删除失败，请刷新后重试", 409);
        return { id: work.id, title: version?.title || "" };
    });
}

export async function reviewWorkPublication(input: { reviewerUserId: unknown; workId: unknown; versionId: unknown; decision: unknown; reason?: unknown }) {
    await assertWorkPublicationReady();
    const reviewerUserId = requiredId(input.reviewerUserId, "审核人");
    const workId = requiredId(input.workId, "作品");
    const versionId = requiredId(input.versionId, "版本");
    const decision = input.decision === "approved" || input.decision === "rejected" ? input.decision : "";
    if (!decision) throw new WorkPublicationServiceError("审核决定无效");
    const reason = text(input.reason, 500);
    if (decision === "rejected" && !reason) throw new WorkPublicationServiceError("请填写驳回原因");

    return withPostgresTransaction(async (client) => {
        const repos = createPostgresRepositories(client);
        const work = await repos.workPublications.getWorkById(workId, undefined, true);
        if (!work) throw new WorkPublicationServiceError("作品不存在", 404);
        if (work.lifecycleStatus !== "active") throw new WorkPublicationServiceError("作品已下架", 409);
        const version = await repos.workPublications.getVersionById(versionId, true);
        if (!version || version.workId !== work.id) throw new WorkPublicationServiceError("作品版本不存在", 404);
        if (work.currentVersionId !== version.id) throw new WorkPublicationServiceError("只能审核作品当前版本", 409);
        if (version.moderationStatus === decision) return requiredWorkDetail(repos, work.id);
        const reviewed = await repos.workPublications.reviewVersion(version.id, {
            status: decision,
            reason: decision === "rejected" ? reason : undefined,
            reviewedAt: new Date().toISOString(),
            reviewedByUserId: reviewerUserId,
        });
        if (!reviewed) throw new WorkPublicationServiceError("作品状态已变化，请刷新后重试", 409);
        if (decision === "approved" && !(await repos.workPublications.setPublishedVersion(work.id, version.id))) throw new WorkPublicationServiceError("公开版本切换失败", 409);
        return requiredWorkDetail(repos, work.id);
    });
}

export async function takeDownWorkPublication(input: { reviewerUserId: unknown; workId: unknown; reason?: unknown }) {
    await assertWorkPublicationReady();
    const reviewerUserId = requiredId(input.reviewerUserId, "操作人");
    const workId = requiredId(input.workId, "作品");
    const reason = text(input.reason, 500);
    if (!reason) throw new WorkPublicationServiceError("请填写下架原因");

    return withPostgresTransaction(async (client) => {
        const repos = createPostgresRepositories(client);
        const work = await repos.workPublications.getWorkById(workId, undefined, true);
        if (!work) throw new WorkPublicationServiceError("作品不存在", 404);
        if (!work.publishedVersionId) throw new WorkPublicationServiceError("作品当前没有公开版本", 409);
        const version = await repos.workPublications.getVersionById(work.publishedVersionId, true);
        if (!version || version.workId !== work.id) throw new WorkPublicationServiceError("公开版本不存在", 409);
        const reviewed = await repos.workPublications.reviewVersion(version.id, {
            status: "taken_down",
            reason,
            reviewedAt: new Date().toISOString(),
            reviewedByUserId: reviewerUserId,
        });
        if (!reviewed) throw new WorkPublicationServiceError("作品状态已变化，请刷新后重试", 409);
        if (!(await repos.workPublications.clearPublishedVersion(work.id))) throw new WorkPublicationServiceError("作品下架失败", 409);
        return requiredWorkDetail(repos, work.id);
    });
}

export async function getPublicWorkPublication(slugValue: unknown) {
    await assertWorkPublicationReady();
    const slug = requiredSlug(slugValue);
    const work = await createPostgresRepositories().workPublications.getPublicWork(slug);
    if (!work?.publishedVersion) throw new WorkPublicationServiceError("作品不存在", 404);
    const publicAssets = work.assets.filter((asset) => asset.mediaType === "image" || asset.mediaType === "video");
    if (!publicAssets.some((asset) => asset.role === "content")) throw new WorkPublicationServiceError("作品不存在", 404);
    return {
        id: work.id,
        slug: work.slug,
        sourceType: work.sourceType,
        viewCount: work.viewCount,
        likeCount: work.likeCount,
        publishedAt: work.publishedVersion.reviewedAt || work.publishedVersion.updatedAt,
        title: work.publishedVersion.title,
        description: work.publishedVersion.description,
        publicPrompt: work.publishedVersion.publicPrompt,
        category: work.publishedVersion.category,
        tags: work.publishedVersion.tags,
        visibility: work.publishedVersion.visibility,
        authorName: work.publishedVersion.authorDisplay === "hidden" ? undefined : work.publishedVersion.authorName,
        authorUsername: work.publishedVersion.authorDisplay === "profile" ? work.ownerUsername : undefined,
        authorAvatarUrl: work.publishedVersion.authorDisplay === "profile" && work.ownerUsername && work.ownerAvatarStorageKey ? userAvatarUrl(work.ownerUsername, work.ownerAvatarUpdatedAt) : undefined,
        assets: publicAssets.map((asset) => ({
            id: asset.id,
            mediaType: asset.mediaType,
            mimeType: asset.mimeType,
            role: asset.role,
            sortOrder: asset.sortOrder,
            metadata: asset.metadata,
            url: publicAssetUrl(work.slug, asset.id),
        })),
    };
}

export async function recordPublicWorkPublicationView(slugValue: unknown) {
    await assertWorkPublicationReady();
    const work = await createPostgresRepositories().workPublications.getPublicWork(requiredSlug(slugValue));
    if (!work) throw new WorkPublicationServiceError("作品不存在", 404);
    return createPostgresRepositories().workPublications.incrementView(work.id, new Date().toISOString());
}

export async function authorizePublicWorkPublicationAsset(slugValue: unknown, assetIdValue: unknown) {
    await assertWorkPublicationReady();
    const asset = await createPostgresRepositories().workPublications.getPublicAsset(requiredSlug(slugValue), requiredId(assetIdValue, "媒体"));
    if (!asset || (asset.mediaType !== "image" && asset.mediaType !== "video")) throw new WorkPublicationServiceError("媒体不存在", 404);
    const registration = await getLocalMediaRegistration(asset.storageKey);
    if (!registration || registration.storageClass !== "permanent" || registration.type !== asset.mediaType) throw new WorkPublicationServiceError("媒体不存在", 404);
    return { asset, registration };
}

async function assertWorkPublicationReady() {
    if (getDatabaseProvider() !== "postgres") throw new WorkPublicationServiceError("作品发布需要启用 PostgreSQL 数据库", 409);
    await ensurePostgresSchema();
}

async function resolveSource(repos: WorkPublicationRepositories, userId: string, sourceType: PublishedWorkSourceType, sourceId: string) {
    const source = await repos.workPublications.getSourceJson(userId, sourceType, sourceId);
    if (!source) throw new WorkPublicationServiceError("发布来源不存在", 404);
    const storageKeys = collectLocalMediaStorageKeys(source.value).slice(0, 200);
    const registrations = await getLocalMediaRegistrations(storageKeys);
    const sourceKeySet = new Set(storageKeys);
    const candidates = registrations
        .filter((item) => sourceKeySet.has(item.storageKey) && item.ownerUserId === userId && item.storageClass === "permanent")
        .filter((item) => item.type === "image" || item.type === "video")
        .map(mediaCandidate)
        .sort((left, right) => storageKeys.indexOf(left.storageKey) - storageKeys.indexOf(right.storageKey));
    if (!candidates.length) throw new WorkPublicationServiceError("该来源没有可公开的永久媒体", 409);
    return {
        sourceType,
        sourceId,
        title: text(source.title, 100) || "未命名作品",
        suggestedPrompt: suggestedPublicPrompt(sourceType, source.value, new Set(candidates.map((candidate) => candidate.storageKey))),
        candidates,
    };
}

function normalizeDraft(
    input: WorkPublicationDraftInput,
    sourceTitle: string,
    user: { username: string; displayName?: string },
    current: { version: PublishedWorkVersionRecord; assets: PublishedWorkAssetRecord[] } | undefined,
    candidates: WorkPublicationMediaCandidate[],
) {
    const candidateMap = new Map(candidates.map((candidate) => [candidate.storageKey, candidate]));
    const existingContentKeys = current?.assets.filter((asset) => asset.role === "content").map((asset) => asset.storageKey) || [];
    const selectedKeys = normalizeStorageKeys(input.assetStorageKeys, existingContentKeys.length ? existingContentKeys : candidates.map((candidate) => candidate.storageKey));
    if (!selectedKeys.length) throw new WorkPublicationServiceError("请至少选择一个作品媒体");
    for (const key of selectedKeys) if (!candidateMap.has(key)) throw new WorkPublicationServiceError("选择的媒体不属于当前来源", 400);

    const existingCoverKey = current?.assets.find((asset) => asset.role === "cover")?.storageKey;
    const requestedCoverKey = input.coverStorageKey === undefined ? existingCoverKey : normalizeStorageKey(input.coverStorageKey);
    const coverStorageKey = requestedCoverKey || selectedKeys.find((key) => candidateMap.get(key)?.mediaType === "image");
    if (coverStorageKey && candidateMap.get(coverStorageKey)?.mediaType !== "image") throw new WorkPublicationServiceError("作品封面必须选择来源中的图片", 400);

    const title = text(input.title === undefined ? current?.version.title || sourceTitle : input.title, 100);
    if (!title) throw new WorkPublicationServiceError("请填写作品标题");
    const publicPrompt = text(input.publicPrompt === undefined ? current?.version.publicPrompt : input.publicPrompt, 8000);
    if (!publicPrompt) throw new WorkPublicationServiceError("请填写公开提示词");
    const authorDisplay = normalizeAuthorDisplay(input.authorDisplay === undefined ? current?.version.authorDisplay : input.authorDisplay);
    const authorName = authorDisplay === "hidden" ? undefined : authorDisplay === "profile" ? text(user.displayName || user.username, 80) : text(input.authorName === undefined ? current?.version.authorName : input.authorName, 80);
    if (authorDisplay === "custom" && !authorName) throw new WorkPublicationServiceError("请填写展示作者名");

    return {
        versionFields: {
            title,
            description: text(input.description === undefined ? current?.version.description : input.description, 2000),
            publicPrompt,
            category: text(input.category === undefined ? current?.version.category || "其他" : input.category, 40) || "其他",
            tags: normalizeTags(input.tags === undefined ? current?.version.tags : input.tags),
            visibility: normalizeVisibility(input.visibility === undefined ? current?.version.visibility : input.visibility),
            authorDisplay,
            authorName,
        },
        selectedKeys,
        coverStorageKey,
    };
}

function suggestedPublicPrompt(sourceType: PublishedWorkSourceType, value: unknown, candidateKeys: ReadonlySet<string>) {
    const source = record(value);
    if (!source) return "";

    if (sourceType === "media") return text(record(source.metadata)?.prompt, 8000);

    if (sourceType === "canvas") {
        const nodes = records(source.nodes).reverse();
        const mediaNodes = nodes.filter((node) => {
            const metadata = record(node.metadata);
            return metadata && candidateKeys.has(text(metadata.storageKey, 700));
        });
        return firstPrompt([...mediaNodes, ...nodes].map((node) => record(node.metadata)?.prompt));
    }

    const shots = records(source.episodes)
        .flatMap((episode) => records(episode.shots))
        .reverse();
    const renderedShots = shots.filter((shot) => text(shot.videoUrl, 2000) || text(shot.storyboardImageUrl, 2000) || text(shot.storyboardEndImageUrl, 2000));
    for (const shot of [...renderedShots, ...shots]) {
        const prompt = text(shot.videoUrl, 2000) ? text(shot.videoPrompt, 8000) || text(shot.imagePrompt, 8000) : text(shot.imagePrompt, 8000) || text(shot.videoPrompt, 8000);
        if (prompt) return prompt;
    }
    return "";
}

function firstPrompt(values: unknown[]) {
    for (const value of values) {
        const prompt = text(value, 8000);
        if (prompt) return prompt;
    }
    return "";
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function records(value: unknown): Array<Record<string, unknown>> {
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
        const entry = record(item);
        return entry ? [entry] : [];
    });
}

function publicationVersion(id: string, workId: string, versionNumber: number, draft: ReturnType<typeof normalizeDraft>, now: string): PublishedWorkVersionRecord {
    return {
        id,
        workId,
        versionNumber,
        ...draft.versionFields,
        moderationStatus: "draft",
        createdAt: now,
        updatedAt: now,
    };
}

function publicationAssets(versionId: string, draft: ReturnType<typeof normalizeDraft>, candidates: WorkPublicationMediaCandidate[], now: string): PublishedWorkAssetRecord[] {
    const candidateMap = new Map(candidates.map((candidate) => [candidate.storageKey, candidate]));
    const records: PublishedWorkAssetRecord[] = [];
    if (draft.coverStorageKey) records.push(publicationAsset(versionId, candidateMap.get(draft.coverStorageKey)!, "cover", 0, now));
    draft.selectedKeys.forEach((key, index) => records.push(publicationAsset(versionId, candidateMap.get(key)!, "content", index, now)));
    return records;
}

function publicationAsset(versionId: string, candidate: WorkPublicationMediaCandidate, role: "cover" | "content", sortOrder: number, now: string): PublishedWorkAssetRecord {
    return {
        id: randomUUID(),
        versionId,
        storageKey: candidate.storageKey,
        mediaType: candidate.mediaType,
        mimeType: candidate.mimeType,
        role,
        sortOrder,
        metadata: { originalName: candidate.originalName, bytes: candidate.bytes },
        createdAt: now,
    };
}

async function requiredWorkDetail(repos: WorkPublicationRepositories, workId: string, ownerUserId?: string) {
    const work = await repos.workPublications.getWorkSummaryById(workId, ownerUserId);
    if (!work) throw new WorkPublicationServiceError("作品不存在", 404);
    return loadWorkDetail(repos, work);
}

async function loadWorkDetail(repos: WorkPublicationRepositories, work: PublishedWorkSummaryRecord) {
    const [currentAssets, publishedAssets] = await Promise.all([
        work.currentVersion ? repos.workPublications.listVersionAssets(work.currentVersion.id) : [],
        work.publishedVersion && work.publishedVersion.id !== work.currentVersion?.id ? repos.workPublications.listVersionAssets(work.publishedVersion.id) : [],
    ]);
    return { ...work, currentAssets, publishedAssets: publishedAssets.length ? publishedAssets : currentAssets };
}

function mediaCandidate(registration: LocalMediaRegistration): WorkPublicationMediaCandidate {
    return {
        storageKey: registration.storageKey,
        mediaType: registration.type,
        mimeType: registration.mimeType,
        originalName: registration.originalName || registration.storageKey.split("/").at(-1) || "媒体",
        bytes: registration.bytes,
        previewUrl: privateAssetUrl(registration),
    };
}

function privateAssetUrl(registration: LocalMediaRegistration) {
    const prefix = registration.scope === "generation" ? "/api/generation-log-assets/" : "/api/reference-assets/";
    return `${prefix}${registration.storageKey.split("/").map(encodeURIComponent).join("/")}`;
}

function publicAssetUrl(slug: string, assetId: string) {
    return `/api/public/works/${encodeURIComponent(slug)}/media/${encodeURIComponent(assetId)}`;
}

function publicationSlug() {
    return randomUUID().replaceAll("-", "").slice(0, 20);
}

function requiredSourceType(value: unknown): PublishedWorkSourceType {
    if (value === "media" || value === "canvas" || value === "drama") return value;
    throw new WorkPublicationServiceError("发布来源类型无效");
}

function requiredId(value: unknown, label: string) {
    const id = text(value, 160);
    if (!id) throw new WorkPublicationServiceError(`${label}标识无效`);
    return id;
}

function requiredSlug(value: unknown) {
    const slug = text(value, 80).toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{5,79}$/.test(slug)) throw new WorkPublicationServiceError("作品链接无效", 404);
    return slug;
}

function moderationStatus(value: unknown) {
    return value === "draft" || value === "pending" || value === "approved" || value === "rejected" || value === "taken_down" ? value : undefined;
}

function normalizeVisibility(value: unknown): PublishedWorkVisibility {
    return value === "public" || value === "unlisted" ? value : "private";
}

function normalizeAuthorDisplay(value: unknown): PublishedWorkAuthorDisplay {
    return value === "custom" || value === "hidden" ? value : "profile";
}

function normalizeTags(value: unknown) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map((tag) => text(tag, 24)).filter(Boolean))].slice(0, 10);
}

function normalizeStorageKeys(value: unknown, fallback: string[]) {
    const source = value === undefined ? fallback : Array.isArray(value) ? value : [];
    return [...new Set(source.map(normalizeStorageKey).filter(Boolean))];
}

function normalizeStorageKey(value: unknown) {
    return typeof value === "string" ? value.trim().replaceAll("\\", "/").replace(/^\/+/, "").slice(0, 700) : "";
}

function text(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}
