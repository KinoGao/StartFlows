import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const workPublications = {
        getWorkBySlug: vi.fn(),
        getWorkById: vi.fn(),
        getVersionById: vi.fn(),
        reviewVersion: vi.fn(),
        clearPublishedVersion: vi.fn(),
        restoreVersion: vi.fn(),
        setPublishedVersion: vi.fn(),
    };
    const workGovernance = {
        listGallery: vi.fn(),
        listSitemapEntries: vi.fn(),
        createCase: vi.fn(),
        listCasesForOwner: vi.fn(),
        listCases: vi.fn(),
        getCaseById: vi.fn(),
        resolveCase: vi.fn(),
        setFeatured: vi.fn(),
    };
    return {
        workPublications,
        workGovernance,
        createPostgresRepositories: vi.fn(() => ({ workPublications, workGovernance })),
        ensurePostgresSchema: vi.fn(),
        getDatabaseProvider: vi.fn(() => "postgres"),
        withPostgresTransaction: vi.fn(async (handler: (client: unknown) => Promise<unknown>) => handler({})),
    };
});

vi.mock("@/lib/server/database", () => mocks);

import { listPublicGallery, listWorkCasesForOwner, resolveWorkGovernanceCase, submitPublicWorkReport, WorkGovernanceServiceError } from "./work-governance-service";

describe("work governance service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getDatabaseProvider.mockReturnValue("postgres");
        mocks.createPostgresRepositories.mockReturnValue({ workPublications: mocks.workPublications, workGovernance: mocks.workGovernance });
    });

    it("forwards owner appeal pagination without widening the work scope", async () => {
        mocks.workGovernance.listCasesForOwner.mockResolvedValue({ items: [], total: 51, page: 3, pageSize: 20 });

        await expect(listWorkCasesForOwner("user-one", "work-one", { page: 3, pageSize: 20 })).resolves.toMatchObject({ total: 51, page: 3 });
        expect(mocks.workGovernance.listCasesForOwner).toHaveBeenCalledWith("work-one", "user-one", { page: 3, pageSize: 20 });
    });

    it("returns a public gallery contract without internal ids", async () => {
        mocks.workGovernance.listGallery.mockResolvedValue({
            items: [
                {
                    workId: "work-one",
                    versionId: "version-one",
                    authorUserId: "user-one",
                    slug: "publicwork123",
                    sourceType: "canvas",
                    viewCount: 4,
                    isFeatured: true,
                    featuredAt: "2026-07-27T00:00:00.000Z",
                    publishedAt: "2026-07-27T00:00:00.000Z",
                    title: "公开作品",
                    description: "说明",
                    category: "插画",
                    tags: ["原创"],
                    authorDisplay: "profile",
                    authorName: "作者",
                    authorUsername: "user-one",
                    authorAvatarStorageKey: "permanent/2026/07/27/images/avatar.webp",
                    authorAvatarUpdatedAt: "2026-07-27T01:00:00.000Z",
                    assetId: "asset-one",
                    assetMediaType: "image",
                    assetMimeType: "image/png",
                },
            ],
            hasMore: false,
        });

        const result = await listPublicGallery();
        const serialized = JSON.stringify(result);

        expect(result.items[0]?.preview?.url).toBe("/api/public/works/publicwork123/media/asset-one");
        expect(result.items[0]?.authorAvatarUrl).toBe("/api/public/users/user-one/avatar?v=2026-07-27T01%3A00%3A00.000Z");
        expect(serialized).not.toContain("work-one");
        expect(serialized).not.toContain("version-one");
        expect(serialized).not.toContain("avatarStorageKey");
        expect(mocks.workGovernance.listGallery).toHaveBeenCalledWith(expect.objectContaining({ sort: "random", randomSeed: expect.any(String) }));
    });

    it("keeps the same random seed when loading the next gallery page", async () => {
        const item = {
            workId: "work-one",
            versionId: "version-one",
            authorUserId: "user-one",
            slug: "publicwork123",
            sourceType: "media",
            viewCount: 0,
            likeCount: 0,
            isFeatured: false,
            publishedAt: "2026-07-27T00:00:00.000Z",
            title: "作品",
            description: "",
            publicPrompt: "提示词",
            category: "插画",
            tags: [],
            authorDisplay: "profile",
            authorName: "作者",
        };
        mocks.workGovernance.listGallery.mockResolvedValueOnce({ items: [item], hasMore: true }).mockResolvedValueOnce({ items: [], hasMore: false });

        const first = await listPublicGallery();
        await listPublicGallery({ cursor: first.nextCursor });

        const firstInput = mocks.workGovernance.listGallery.mock.calls[0]?.[0];
        const secondInput = mocks.workGovernance.listGallery.mock.calls[1]?.[0];
        expect(firstInput.randomSeed).toEqual(expect.any(String));
        expect(secondInput.randomSeed).toBe(firstInput.randomSeed);
        expect(secondInput.after).toMatchObject({ sort: "random", randomSeed: firstInput.randomSeed, id: "work-one" });
    });

    it("does not allow an owner to report their own work", async () => {
        mocks.workPublications.getWorkBySlug.mockResolvedValue({ id: "work-one", ownerUserId: "user-one", publishedVersionId: "version-one", lifecycleStatus: "active" });

        await expect(submitPublicWorkReport("user-one", "publicwork123", { category: "other", description: "这是具体举报说明" })).rejects.toEqual(
            expect.objectContaining<Partial<WorkGovernanceServiceError>>({ status: 409, message: "不能举报自己的作品" }),
        );
        expect(mocks.workGovernance.createCase).not.toHaveBeenCalled();
    });

    it("does not take down a newer live version when resolving an old report", async () => {
        mocks.workGovernance.getCaseById.mockResolvedValue({ id: "case-one", workId: "work-one", versionId: "version-old", submitterUserId: "user-two", caseType: "report", category: "illegal", description: "举报说明", status: "open" });
        mocks.workPublications.getWorkById.mockResolvedValue({ id: "work-one", ownerUserId: "user-one", lifecycleStatus: "active", publishedVersionId: "version-new" });
        mocks.workPublications.getVersionById.mockResolvedValue({ id: "version-old", workId: "work-one", moderationStatus: "approved" });
        mocks.workGovernance.resolveCase.mockResolvedValue({ id: "case-one", status: "approved" });

        await resolveWorkGovernanceCase({ actorUserId: "admin-one", caseId: "case-one", decision: "approved", resolution: "举报成立，但线上版本已经更新" });

        expect(mocks.workPublications.reviewVersion).not.toHaveBeenCalled();
        expect(mocks.workPublications.clearPublishedVersion).not.toHaveBeenCalled();
        expect(mocks.workGovernance.resolveCase).toHaveBeenCalledWith("case-one", expect.objectContaining({ status: "approved", handledByUserId: "admin-one" }));
    });

    it("restores a taken-down version only through an approved owner appeal", async () => {
        mocks.workGovernance.getCaseById.mockResolvedValue({ id: "case-one", workId: "work-one", versionId: "version-one", submitterUserId: "user-one", caseType: "appeal", category: "appeal", description: "申诉说明", status: "open" });
        mocks.workPublications.getWorkById.mockResolvedValue({ id: "work-one", ownerUserId: "user-one", lifecycleStatus: "active" });
        mocks.workPublications.getVersionById.mockResolvedValue({ id: "version-one", workId: "work-one", moderationStatus: "taken_down" });
        mocks.workPublications.restoreVersion.mockResolvedValue({ id: "version-one", moderationStatus: "approved" });
        mocks.workPublications.setPublishedVersion.mockResolvedValue({ id: "work-one", publishedVersionId: "version-one" });
        mocks.workGovernance.resolveCase.mockResolvedValue({ id: "case-one", status: "approved" });

        await resolveWorkGovernanceCase({ actorUserId: "admin-one", caseId: "case-one", decision: "approved", resolution: "已核验原创记录，恢复作品" });

        expect(mocks.workPublications.restoreVersion).toHaveBeenCalledWith("version-one", expect.any(String), "admin-one");
        expect(mocks.workPublications.setPublishedVersion).toHaveBeenCalledWith("work-one", "version-one");
    });
});
