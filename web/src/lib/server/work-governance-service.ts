import { createHash, randomUUID } from "node:crypto";

import { createPostgresRepositories, ensurePostgresSchema, getDatabaseProvider, withPostgresTransaction } from "@/lib/server/database";
import type { PublishedGalleryItemRecord, PublishedWorkCaseRecord, PublishedWorkCaseStatus, PublishedWorkCaseType } from "@/lib/server/database";
import type { GalleryCursor, GallerySort } from "@/lib/server/database/work-governance-repository";
import { publicGalleryItem } from "@/lib/server/public-work-view";

export class WorkGovernanceServiceError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
        this.name = "WorkGovernanceServiceError";
    }
}

export async function listPublicGallery(input: { limit?: number; sort?: unknown; category?: unknown; tag?: unknown; keyword?: unknown; featured?: unknown; cursor?: unknown } = {}) {
    await assertReady();
    const sort = gallerySort(input.sort);
    const after = decodeCursor(input.cursor, sort);
    const randomSeed = sort === "random" ? after?.randomSeed || randomUUID() : "";
    const result = await createPostgresRepositories().workGovernance.listGallery({
        limit: Math.max(1, Math.min(48, Math.floor(Number(input.limit) || 12))),
        sort,
        category: text(input.category, 40),
        tag: text(input.tag, 24),
        keyword: text(input.keyword, 100),
        featuredOnly: input.featured === true || input.featured === "true" || input.featured === "1",
        randomSeed,
        after,
    });
    const items = result.items.map(publicGalleryItem);
    const last = result.items.at(-1);
    return { items, nextCursor: result.hasMore && last ? encodeCursor(last, sort, randomSeed) : undefined };
}

export async function listPublicWorkSitemapEntries(limit = 5000) {
    await assertReady();
    return createPostgresRepositories().workGovernance.listSitemapEntries(limit);
}

export async function submitPublicWorkReport(userIdValue: unknown, slugValue: unknown, input: { category?: unknown; description?: unknown }) {
    await assertReady();
    const userId = requiredId(userIdValue, "用户");
    const slug = requiredSlug(slugValue);
    const category = reportCategory(input.category);
    const description = requiredDescription(input.description, "举报说明");
    try {
        return await withPostgresTransaction(async (client) => {
            const repos = createPostgresRepositories(client);
            const work = await repos.workPublications.getWorkBySlug(slug, true);
            if (!work?.publishedVersionId || work.lifecycleStatus !== "active") throw new WorkGovernanceServiceError("作品不存在", 404);
            if (work.ownerUserId === userId) throw new WorkGovernanceServiceError("不能举报自己的作品", 409);
            const version = await repos.workPublications.getVersionById(work.publishedVersionId, true);
            if (!version || version.moderationStatus !== "approved" || (version.visibility !== "public" && version.visibility !== "unlisted")) throw new WorkGovernanceServiceError("作品不存在", 404);
            return repos.workGovernance.createCase(caseRecord(work.id, version.id, userId, "report", category, description));
        });
    } catch (error) {
        if (isUniqueViolation(error)) throw new WorkGovernanceServiceError("你已经提交过该版本的举报，请等待处理", 409);
        throw error;
    }
}

export async function submitWorkAppeal(userIdValue: unknown, workIdValue: unknown, input: { versionId?: unknown; description?: unknown }) {
    await assertReady();
    const userId = requiredId(userIdValue, "用户");
    const workId = requiredId(workIdValue, "作品");
    const description = requiredDescription(input.description, "申诉说明");
    try {
        return await withPostgresTransaction(async (client) => {
            const repos = createPostgresRepositories(client);
            const work = await repos.workPublications.getWorkById(workId, userId, true);
            if (!work) throw new WorkGovernanceServiceError("作品不存在", 404);
            if (work.lifecycleStatus !== "active") throw new WorkGovernanceServiceError("已撤销作品不能申诉恢复", 409);
            const versionId = input.versionId ? requiredId(input.versionId, "版本") : work.currentVersionId;
            if (!versionId) throw new WorkGovernanceServiceError("下架版本不存在", 409);
            const version = await repos.workPublications.getVersionById(versionId, true);
            if (!version || version.workId !== work.id || version.moderationStatus !== "taken_down") throw new WorkGovernanceServiceError("只能申诉本人被下架的版本", 409);
            return repos.workGovernance.createCase(caseRecord(work.id, version.id, userId, "appeal", "appeal", description));
        });
    } catch (error) {
        if (isUniqueViolation(error)) throw new WorkGovernanceServiceError("该版本已有待处理申诉", 409);
        throw error;
    }
}

export async function listWorkCasesForOwner(userIdValue: unknown, workIdValue: unknown, input: { page?: number; pageSize?: number } = {}) {
    await assertReady();
    return createPostgresRepositories().workGovernance.listCasesForOwner(requiredId(workIdValue, "作品"), requiredId(userIdValue, "用户"), input);
}

export async function listWorkGovernanceCasesForAdmin(input: { page?: number; pageSize?: number; caseType?: unknown; status?: unknown; keyword?: unknown } = {}) {
    await assertReady();
    return createPostgresRepositories().workGovernance.listCases({
        page: input.page,
        pageSize: input.pageSize,
        caseType: caseType(input.caseType),
        status: caseStatus(input.status),
        keyword: text(input.keyword, 100),
    });
}

export async function resolveWorkGovernanceCase(input: { actorUserId: unknown; caseId: unknown; decision: unknown; resolution?: unknown }) {
    await assertReady();
    const actorUserId = requiredId(input.actorUserId, "操作人");
    const caseId = requiredId(input.caseId, "治理案件");
    const decision = input.decision === "approved" || input.decision === "rejected" ? input.decision : undefined;
    if (!decision) throw new WorkGovernanceServiceError("处理决定无效");
    const resolution = requiredDescription(input.resolution, "处理说明");

    return withPostgresTransaction(async (client) => {
        const repos = createPostgresRepositories(client);
        const current = await repos.workGovernance.getCaseById(caseId, true);
        if (!current) throw new WorkGovernanceServiceError("治理案件不存在", 404);
        if (current.status !== "open") return current;
        const work = await repos.workPublications.getWorkById(current.workId, undefined, true);
        const version = await repos.workPublications.getVersionById(current.versionId, true);
        if (!work || !version || version.workId !== work.id) throw new WorkGovernanceServiceError("案件关联作品不存在", 409);
        const now = new Date().toISOString();

        if (decision === "approved" && current.caseType === "report" && work.publishedVersionId === version.id && version.moderationStatus === "approved") {
            if (!(await repos.workPublications.reviewVersion(version.id, { status: "taken_down", reason: resolution, reviewedAt: now, reviewedByUserId: actorUserId }))) throw new WorkGovernanceServiceError("作品状态已变化，请刷新后重试", 409);
            if (!(await repos.workPublications.clearPublishedVersion(work.id))) throw new WorkGovernanceServiceError("作品下架失败", 409);
        }

        if (decision === "approved" && current.caseType === "appeal") {
            if (work.lifecycleStatus !== "active") throw new WorkGovernanceServiceError("作品已撤销，不能恢复", 409);
            if (work.publishedVersionId && work.publishedVersionId !== version.id) throw new WorkGovernanceServiceError("作品已有其他线上版本，不能恢复旧版本", 409);
            if (version.moderationStatus === "taken_down") {
                if (!(await repos.workPublications.restoreVersion(version.id, now, actorUserId))) throw new WorkGovernanceServiceError("下架版本状态已变化", 409);
                if (!(await repos.workPublications.setPublishedVersion(work.id, version.id))) throw new WorkGovernanceServiceError("作品恢复失败", 409);
            } else if (version.moderationStatus !== "approved" || work.publishedVersionId !== version.id) {
                throw new WorkGovernanceServiceError("下架版本状态已变化", 409);
            }
        }

        const resolved = await repos.workGovernance.resolveCase(current.id, { status: decision, resolution, handledByUserId: actorUserId, handledAt: now });
        if (!resolved) throw new WorkGovernanceServiceError("案件状态已变化，请刷新后重试", 409);
        return resolved;
    });
}

export async function setWorkFeatured(input: { actorUserId: unknown; workId: unknown; featured: unknown }) {
    await assertReady();
    const featured = input.featured === true;
    const work = await createPostgresRepositories().workGovernance.setFeatured(requiredId(input.workId, "作品"), featured, requiredId(input.actorUserId, "操作人"), new Date().toISOString());
    if (!work) throw new WorkGovernanceServiceError(featured ? "只有当前公开作品可以设为精选" : "作品不存在", featured ? 409 : 404);
    return work;
}

function caseRecord(workId: string, versionId: string, submitterUserId: string, type: PublishedWorkCaseType, category: string, description: string): PublishedWorkCaseRecord {
    const now = new Date().toISOString();
    return { id: randomUUID(), workId, versionId, submitterUserId, caseType: type, category, description, status: "open", createdAt: now, updatedAt: now };
}

function encodeCursor(item: PublishedGalleryItemRecord, sort: GallerySort, randomSeed: string) {
    const cursor: GalleryCursor = {
        sort,
        featureRank: item.isFeatured ? 1 : 0,
        featuredAt: item.featuredAt || new Date(0).toISOString(),
        viewCount: item.viewCount,
        publishedAt: item.publishedAt,
        randomSeed,
        randomRank: sort === "random" ? createHash("md5").update(`${item.workId}${randomSeed}`).digest("hex") : "",
        id: item.workId,
    };
    return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value: unknown, sort: GallerySort): GalleryCursor | undefined {
    if (typeof value !== "string" || !value || value.length > 800) return undefined;
    try {
        const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<GalleryCursor>;
        if (parsed.sort !== sort || typeof parsed.id !== "string" || !parsed.id) return undefined;
        if (sort === "random") {
            if (typeof parsed.randomSeed !== "string" || !parsed.randomSeed || parsed.randomSeed.length > 100 || typeof parsed.randomRank !== "string" || !/^[a-f0-9]{32}$/.test(parsed.randomRank)) return undefined;
            return {
                sort,
                featureRank: 0,
                featuredAt: new Date(0).toISOString(),
                viewCount: 0,
                publishedAt: new Date(0).toISOString(),
                randomSeed: parsed.randomSeed,
                randomRank: parsed.randomRank,
                id: parsed.id,
            };
        }
        if ((parsed.featureRank !== 0 && parsed.featureRank !== 1) || !Number.isFinite(parsed.viewCount) || !validIso(parsed.featuredAt) || !validIso(parsed.publishedAt)) return undefined;
        return parsed as GalleryCursor;
    } catch {
        return undefined;
    }
}

function validIso(value: unknown) {
    return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function gallerySort(value: unknown): GallerySort {
    return value === "featured" || value === "latest" || value === "popular" ? value : "random";
}

function reportCategory(value: unknown) {
    return value === "copyright" || value === "privacy" || value === "illegal" || value === "spam" || value === "other" ? value : "other";
}

function caseType(value: unknown): PublishedWorkCaseType | undefined {
    return value === "report" || value === "appeal" ? value : undefined;
}

function caseStatus(value: unknown): PublishedWorkCaseStatus | undefined {
    return value === "open" || value === "approved" || value === "rejected" ? value : undefined;
}

function requiredDescription(value: unknown, label: string) {
    const result = text(value, 1000);
    if (result.length < 5) throw new WorkGovernanceServiceError(`${label}至少填写 5 个字`);
    return result;
}

function requiredId(value: unknown, label: string) {
    const result = text(value, 160);
    if (!result) throw new WorkGovernanceServiceError(`${label}标识无效`);
    return result;
}

function requiredSlug(value: unknown) {
    const slug = text(value, 80).toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]{5,79}$/.test(slug)) throw new WorkGovernanceServiceError("作品链接无效", 404);
    return slug;
}

function text(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function isUniqueViolation(error: unknown) {
    return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "23505");
}

async function assertReady() {
    if (getDatabaseProvider() !== "postgres") throw new WorkGovernanceServiceError("作品广场需要启用 PostgreSQL 数据库", 409);
    await ensurePostgresSchema();
}
