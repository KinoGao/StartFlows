import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createRepositories: vi.fn(),
    ensureSchema: vi.fn(),
    getDatabaseProvider: vi.fn(() => "postgres"),
    getRegistration: vi.fn(),
    getRegistrations: vi.fn(),
    transaction: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
    createPostgresRepositories: mocks.createRepositories,
    ensurePostgresSchema: mocks.ensureSchema,
    getDatabaseProvider: mocks.getDatabaseProvider,
    withPostgresTransaction: mocks.transaction,
}));
vi.mock("@/lib/server/local-media-registry", () => ({
    getLocalMediaRegistration: mocks.getRegistration,
    getLocalMediaRegistrations: mocks.getRegistrations,
}));

import {
    createWorkPublicationDraft,
    deleteWorkPublicationForAdmin,
    deleteWorkPublicationForUser,
    getPublicWorkPublication,
    getWorkPublicationSource,
    listWorkPublicationSources,
    listWorkPublicationsForAdmin,
    listWorkPublicationsForUser,
    relistWorkPublication,
    reviewWorkPublication,
    updateWorkPublicationDraft,
} from "./work-publication-service";

const now = "2026-07-27T00:00:00.000Z";
const ownedImage = {
    storageKey: "permanent/2026/07/27/images/work.png",
    scope: "reference",
    storageClass: "permanent",
    type: "image",
    ownerUserId: "user-one",
    originalName: "work.png",
    source: "user-upload",
    mimeType: "image/png",
    bytes: 1024,
    createdAt: now,
};

describe("work publication service", () => {
    let state: { work?: Record<string, unknown>; version?: Record<string, unknown>; assets: Array<Record<string, unknown>> };
    let workPublications: Record<string, ReturnType<typeof vi.fn>>;

    beforeEach(() => {
        vi.clearAllMocks();
        state = { assets: [] };
        workPublications = {
            listWorks: vi.fn(async (input) => ({ items: [], total: 0, page: input.page || 1, pageSize: input.pageSize || 20 })),
            listSourceSummaries: vi.fn(async (_userId, input) => ({ items: [], total: 0, page: input.page || 1, pageSize: input.pageSize || 20 })),
            getSourceJson: vi.fn(async () => ({ title: "来源作品", value: { data: { storageKey: ownedImage.storageKey }, metadata: { prompt: "用户可见提示词" } } })),
            createWork: vi.fn(async (work) => {
                state.work = work;
                return work;
            }),
            createVersion: vi.fn(async (version) => {
                state.version = version;
                return version;
            }),
            replaceVersionAssets: vi.fn(async (_versionId, assets) => {
                state.assets = assets;
                return assets;
            }),
            setCurrentVersion: vi.fn(async (_workId, versionId) => {
                state.work = { ...state.work, currentVersionId: versionId };
                return state.work;
            }),
            getWorkSummaryById: vi.fn(async () => ({ ...state.work, currentVersion: state.version })),
            listVersionAssets: vi.fn(async () => state.assets),
            getWorkById: vi.fn(async () => state.work),
            getVersionById: vi.fn(async () => state.version),
            getNextVersionNumber: vi.fn(async () => 2),
            updateDraftVersion: vi.fn(),
            reviewVersion: vi.fn(async (_id, patch) => {
                state.version = { ...state.version, moderationStatus: patch.status, rejectionReason: patch.reason };
                return state.version;
            }),
            setPublishedVersion: vi.fn(async (_workId, versionId) => {
                state.work = { ...state.work, publishedVersionId: versionId };
                return state.work;
            }),
            getLatestApprovedPublicVersion: vi.fn(async () => state.version),
            relistWork: vi.fn(async (_workId, versionId) => {
                state.work = { ...state.work, lifecycleStatus: "active", publishedVersionId: versionId };
                return state.work;
            }),
            hasTakenDownVersion: vi.fn(async () => false),
            deleteWorkCompletely: vi.fn(async () => "work-one"),
            getPublicWork: vi.fn(),
        };
        mocks.createRepositories.mockReturnValue({
            users: { getById: vi.fn(async () => ({ id: "user-one", username: "author", displayName: "作者", status: "active" })) },
            workPublications,
        });
        mocks.transaction.mockImplementation(async (handler) => handler({ query: vi.fn() }));
        mocks.getRegistrations.mockResolvedValue([ownedImage]);
    });

    it("forwards source type, search, and pagination to the repository", async () => {
        await expect(listWorkPublicationSources("user-one", { sourceType: "canvas", keyword: " 分镜 ", page: 3, pageSize: 40 })).resolves.toEqual({ items: [], total: 0, page: 3, pageSize: 40 });
        expect(workPublications.listSourceSummaries).toHaveBeenCalledWith("user-one", { sourceType: "canvas", keyword: "分镜", page: 3, pageSize: 40 });
    });

    it("creates one immutable source snapshot and selects only registered permanent media", async () => {
        const result = await createWorkPublicationDraft("user-one", {
            sourceType: "media",
            sourceId: "asset-one",
            title: "公开作品",
            publicPrompt: "用户可见提示词",
            visibility: "public",
            assetStorageKeys: [ownedImage.storageKey],
            coverStorageKey: ownedImage.storageKey,
        });

        expect(workPublications.createWork).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: "user-one", sourceType: "media", sourceId: "asset-one", lifecycleStatus: "active" }));
        expect(workPublications.createVersion).toHaveBeenCalledWith(expect.objectContaining({ versionNumber: 1, title: "公开作品", authorName: "作者", moderationStatus: "draft" }));
        expect(workPublications.replaceVersionAssets).toHaveBeenCalledWith(
            expect.any(String),
            expect.arrayContaining([expect.objectContaining({ storageKey: ownedImage.storageKey, role: "cover", mediaType: "image" }), expect.objectContaining({ storageKey: ownedImage.storageKey, role: "content", mediaType: "image" })]),
        );
        expect(result.currentVersion).toMatchObject({ title: "公开作品" });
    });

    it("preserves every explicitly selected source asset beyond the former media limit", async () => {
        const registrations = Array.from({ length: 21 }, (_, index) => ({
            ...ownedImage,
            storageKey: `permanent/2026/07/27/images/work-${index}.png`,
            originalName: `work-${index}.png`,
        }));
        workPublications.getSourceJson.mockResolvedValueOnce({
            title: "多图画布",
            value: { nodes: registrations.map((item) => ({ metadata: { storageKey: item.storageKey, prompt: "用户可见提示词" } })) },
        });
        mocks.getRegistrations.mockResolvedValueOnce(registrations);

        await createWorkPublicationDraft("user-one", {
            sourceType: "canvas",
            sourceId: "canvas-many",
            title: "多图作品",
            publicPrompt: "用户可见提示词",
            visibility: "public",
            assetStorageKeys: registrations.map((item) => item.storageKey),
        });

        const savedAssets = workPublications.replaceVersionAssets.mock.calls[0]?.[1] as Array<{ storageKey: string; role: string }>;
        const contentAssets = savedAssets.filter((item) => item.role === "content");
        expect(contentAssets).toHaveLength(21);
        expect(contentAssets.at(-1)?.storageKey).toBe(registrations.at(-1)?.storageKey);
    });

    it("rejects media that is returned by storage but is not referenced by the selected source", async () => {
        const unrelated = { ...ownedImage, storageKey: "permanent/2026/07/27/images/unrelated.png" };
        mocks.getRegistrations.mockResolvedValue([ownedImage, unrelated]);

        await expect(
            createWorkPublicationDraft("user-one", {
                sourceType: "media",
                sourceId: "asset-one",
                publicPrompt: "用户可见提示词",
                assetStorageKeys: [unrelated.storageKey],
            }),
        ).rejects.toMatchObject({ status: 400, message: "选择的媒体不属于当前来源" });
        expect(workPublications.createWork).not.toHaveBeenCalled();
    });

    it("rejects audio even when it belongs to the selected source", async () => {
        const ownedAudio = {
            ...ownedImage,
            storageKey: "permanent/2026/07/27/audio/work.mp3",
            type: "audio",
            mimeType: "audio/mpeg",
            originalName: "work.mp3",
        };
        workPublications.getSourceJson.mockResolvedValueOnce({
            title: "来源作品",
            value: { data: { storageKey: ownedImage.storageKey }, audioUrl: ownedAudio.storageKey, metadata: { prompt: "用户可见提示词" } },
        });
        mocks.getRegistrations.mockResolvedValueOnce([ownedImage, ownedAudio]);

        await expect(
            createWorkPublicationDraft("user-one", {
                sourceType: "media",
                sourceId: "asset-one",
                publicPrompt: "用户可见提示词",
                assetStorageKeys: [ownedAudio.storageKey],
            }),
        ).rejects.toMatchObject({ status: 400, message: "选择的媒体不属于当前来源" });
        expect(workPublications.createWork).not.toHaveBeenCalled();
    });

    it("rejects temporary or foreign-owned source media", async () => {
        mocks.getRegistrations.mockResolvedValue([
            { ...ownedImage, storageClass: "temporary" },
            { ...ownedImage, ownerUserId: "user-two" },
        ]);

        await expect(createWorkPublicationDraft("user-one", { sourceType: "media", sourceId: "asset-one", publicPrompt: "用户可见提示词" })).rejects.toMatchObject({ status: 409, message: "该来源没有可公开的永久媒体" });
    });

    it("suggests only a user-visible source prompt", async () => {
        await expect(getWorkPublicationSource("user-one", "media", "asset-one")).resolves.toMatchObject({ suggestedPrompt: "用户可见提示词" });

        workPublications.getSourceJson.mockResolvedValueOnce({
            title: "画布来源",
            value: {
                resolvedPrompt: "隐藏规划提示词",
                nodes: [{ metadata: { storageKey: ownedImage.storageKey, prompt: "画布节点可见提示词" } }, { metadata: { resolvedPrompt: "另一个隐藏规划提示词" } }],
            },
        });
        await expect(getWorkPublicationSource("user-one", "canvas", "canvas-one")).resolves.toMatchObject({ suggestedPrompt: "画布节点可见提示词" });

        workPublications.getSourceJson.mockResolvedValueOnce({
            title: "短剧来源",
            value: {
                resolvedPrompt: "隐藏短剧规划",
                episodes: [{ shots: [{ videoUrl: ownedImage.storageKey, imagePrompt: "分镜可见提示词", resolvedPrompt: "隐藏镜头规划" }] }],
            },
        });
        await expect(getWorkPublicationSource("user-one", "drama", "drama-one")).resolves.toMatchObject({ suggestedPrompt: "分镜可见提示词" });

        workPublications.getSourceJson.mockResolvedValueOnce({ title: "画布来源", value: { resolvedPrompt: "隐藏规划提示词", nodes: [{ metadata: { storageKey: ownedImage.storageKey, resolvedPrompt: "隐藏节点规划" } }] } });
        await expect(getWorkPublicationSource("user-one", "canvas", "canvas-two")).resolves.toMatchObject({ suggestedPrompt: "" });
    });

    it("requires a public prompt for every draft", async () => {
        await expect(createWorkPublicationDraft("user-one", { sourceType: "media", sourceId: "asset-one" })).rejects.toMatchObject({ status: 400, message: "请填写公开提示词" });
        expect(workPublications.createWork).not.toHaveBeenCalled();
    });

    it("keeps approved and taken-down user filters in their correct lifecycle groups", async () => {
        await listWorkPublicationsForUser("user-one", { status: "approved", page: 2, pageSize: 10 });
        expect(workPublications.listWorks).toHaveBeenLastCalledWith(expect.objectContaining({ ownerUserId: "user-one", moderationStatus: "approved", lifecycleStatus: "active", userStatus: undefined, page: 2, pageSize: 10 }));

        await listWorkPublicationsForUser("user-one", { status: "taken_down" });
        expect(workPublications.listWorks).toHaveBeenLastCalledWith(expect.objectContaining({ ownerUserId: "user-one", moderationStatus: undefined, lifecycleStatus: undefined, userStatus: "taken_down" }));
    });

    it("uses the same approved and taken-down grouping in administration", async () => {
        await listWorkPublicationsForAdmin({ status: "approved", lifecycleStatus: "all" });
        expect(workPublications.listWorks).toHaveBeenLastCalledWith(expect.objectContaining({ moderationStatus: "approved", lifecycleStatus: "active", userStatus: undefined }));

        await listWorkPublicationsForAdmin({ status: "taken_down", lifecycleStatus: "all" });
        expect(workPublications.listWorks).toHaveBeenLastCalledWith(expect.objectContaining({ moderationStatus: undefined, lifecycleStatus: undefined, userStatus: "taken_down" }));

        await listWorkPublicationsForAdmin({ status: "taken_down", lifecycleStatus: "revoked" });
        expect(workPublications.listWorks).toHaveBeenLastCalledWith(expect.objectContaining({ moderationStatus: undefined, lifecycleStatus: "revoked", userStatus: "taken_down" }));
    });

    it("returns the registered generation url for an admin work preview", async () => {
        const generationImage = { ...ownedImage, scope: "generation" as const };
        workPublications.listWorks.mockResolvedValueOnce({
            items: [{ id: "work-one", currentPreview: { id: "preview-one", storageKey: generationImage.storageKey, mediaType: "image" } }],
            total: 1,
            page: 1,
            pageSize: 20,
        });
        mocks.getRegistrations.mockResolvedValueOnce([generationImage]);

        const result = await listWorkPublicationsForAdmin();

        expect(mocks.getRegistrations).toHaveBeenCalledWith([generationImage.storageKey]);
        expect(result.items[0]?.currentPreview).toMatchObject({ previewUrl: `/api/generation-log-assets/${generationImage.storageKey}` });
    });

    it("creates a new draft version when editing an approved work without replacing the live version", async () => {
        state.work = {
            id: "work-one",
            ownerUserId: "user-one",
            sourceType: "media",
            sourceId: "asset-one",
            lifecycleStatus: "active",
            currentVersionId: "version-one",
            publishedVersionId: "version-one",
        };
        state.version = {
            id: "version-one",
            workId: "work-one",
            versionNumber: 1,
            title: "线上版本",
            description: "",
            publicPrompt: "线上提示词",
            category: "其他",
            tags: [],
            visibility: "public",
            authorDisplay: "profile",
            authorName: "作者",
            moderationStatus: "approved",
            createdAt: now,
            updatedAt: now,
        };
        state.assets = [{ id: "asset-one", versionId: "version-one", storageKey: ownedImage.storageKey, mediaType: "image", mimeType: "image/png", role: "content", sortOrder: 0, metadata: {}, createdAt: now }];

        await updateWorkPublicationDraft("user-one", "work-one", { title: "候选版本", publicPrompt: "候选提示词" });

        expect(workPublications.updateDraftVersion).not.toHaveBeenCalled();
        expect(workPublications.createVersion).toHaveBeenCalledWith(expect.objectContaining({ workId: "work-one", versionNumber: 2, title: "候选版本", moderationStatus: "draft" }));
        expect(workPublications.setCurrentVersion).toHaveBeenCalledWith("work-one", expect.any(String));
        expect(workPublications.setPublishedVersion).not.toHaveBeenCalled();
        expect(state.work?.publishedVersionId).toBe("version-one");
    });

    it("atomically points the work at an approved current version", async () => {
        state.work = { id: "work-one", ownerUserId: "user-one", lifecycleStatus: "active", currentVersionId: "version-two" };
        state.version = { id: "version-two", workId: "work-one", moderationStatus: "pending" };

        await reviewWorkPublication({ reviewerUserId: "admin-one", workId: "work-one", versionId: "version-two", decision: "approved" });

        expect(workPublications.reviewVersion).toHaveBeenCalledWith("version-two", expect.objectContaining({ status: "approved", reviewedByUserId: "admin-one" }));
        expect(workPublications.setPublishedVersion).toHaveBeenCalledWith("work-one", "version-two");
    });

    it("requires the owner to take down a work before permanently deleting it", async () => {
        state.work = { id: "work-one", ownerUserId: "user-one", lifecycleStatus: "active", currentVersionId: "version-one" };

        await expect(deleteWorkPublicationForUser("user-one", "work-one")).rejects.toMatchObject({ status: 409, message: "请先下架作品再删除" });
        expect(workPublications.deleteWorkCompletely).not.toHaveBeenCalled();
    });

    it("permanently deletes an owner's publication records after take-down", async () => {
        state.work = { id: "work-one", ownerUserId: "user-one", lifecycleStatus: "revoked", currentVersionId: "version-one" };
        state.version = { id: "version-one", workId: "work-one", title: "待删除作品" };

        await expect(deleteWorkPublicationForUser("user-one", "work-one")).resolves.toEqual({ id: "work-one", title: "待删除作品" });
        expect(workPublications.getWorkById).toHaveBeenCalledWith("work-one", "user-one", true);
        expect(workPublications.deleteWorkCompletely).toHaveBeenCalledWith("work-one");
    });

    it("re-lists the latest approved public version after an owner take-down", async () => {
        state.work = { id: "work-one", ownerUserId: "user-one", lifecycleStatus: "revoked", currentVersionId: "version-two" };
        state.version = { id: "version-one", workId: "work-one", title: "已通过作品", moderationStatus: "approved", visibility: "public" };

        await relistWorkPublication("user-one", "work-one");

        expect(workPublications.getLatestApprovedPublicVersion).toHaveBeenCalledWith("work-one", true);
        expect(workPublications.relistWork).toHaveBeenCalledWith("work-one", "version-one");
    });

    it("does not let an owner bypass review after an administrator take-down", async () => {
        state.work = { id: "work-one", ownerUserId: "user-one", lifecycleStatus: "active", currentVersionId: "version-one" };

        await expect(relistWorkPublication("user-one", "work-one")).rejects.toMatchObject({ status: 409, message: "该作品需要重新审核后才能上架" });
        expect(workPublications.relistWork).not.toHaveBeenCalled();
    });

    it("requires administrators to take down a live work before permanently deleting it", async () => {
        state.work = { id: "work-one", ownerUserId: "user-one", lifecycleStatus: "active", currentVersionId: "version-one", publishedVersionId: "version-one" };

        await expect(deleteWorkPublicationForAdmin("admin-one", "work-one")).rejects.toMatchObject({ status: 409, message: "请先下架作品再删除" });
        expect(workPublications.deleteWorkCompletely).not.toHaveBeenCalled();
    });

    it("lets administrators delete all publication records after a moderation take-down", async () => {
        state.work = { id: "work-one", ownerUserId: "user-one", lifecycleStatus: "active", currentVersionId: "version-two" };
        state.version = { id: "version-two", workId: "work-one", title: "待删除作品" };
        workPublications.hasTakenDownVersion.mockResolvedValue(true);

        await expect(deleteWorkPublicationForAdmin("admin-one", "work-one")).resolves.toEqual({ id: "work-one", title: "待删除作品" });
        expect(workPublications.deleteWorkCompletely).toHaveBeenCalledWith("work-one");
    });

    it("returns a public contract without owner ids, source ids, or storage keys", async () => {
        workPublications.getPublicWork.mockResolvedValue({
            id: "work-one",
            ownerUserId: "user-one",
            sourceType: "canvas",
            sourceId: "private-canvas-id",
            slug: "publicwork123",
            viewCount: 3,
            publishedVersion: {
                id: "version-one",
                title: "公开作品",
                description: "公开说明",
                category: "插画",
                tags: ["精选"],
                visibility: "public",
                authorDisplay: "profile",
                authorName: "作者",
                updatedAt: now,
            },
            assets: [{ id: "asset-one", storageKey: ownedImage.storageKey, mediaType: "image", mimeType: "image/png", role: "content", sortOrder: 0, metadata: {}, createdAt: now }],
        });

        const result = await getPublicWorkPublication("publicwork123");
        const serialized = JSON.stringify(result);

        expect(result.assets[0]?.url).toBe("/api/public/works/publicwork123/media/asset-one");
        expect(serialized).not.toContain("user-one");
        expect(serialized).not.toContain("private-canvas-id");
        expect(serialized).not.toContain(ownedImage.storageKey);
    });
});
