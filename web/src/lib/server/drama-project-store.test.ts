import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DramaProject } from "@/lib/drama-project-contract";

const mocks = vi.hoisted(() => ({ files: new Map<string, unknown>(), provider: "file" as "file" | "postgres", postgresQuery: vi.fn(), ensurePostgresSchema: vi.fn() }));

vi.mock("@/lib/server/database", () => ({
    ensurePostgresSchema: mocks.ensurePostgresSchema,
    getDatabaseProvider: vi.fn(() => mocks.provider),
    postgresQuery: mocks.postgresQuery,
}));
vi.mock("@/lib/server/data-adapter", () => ({
    readJsonDataFile: vi.fn(async (name: string, fallback: unknown) => structuredClone(mocks.files.has(name) ? mocks.files.get(name) : fallback)),
    writeJsonDataFile: vi.fn(async (name: string, value: unknown) => {
        mocks.files.set(name, structuredClone(value));
    }),
}));

import { createDramaProject, deleteDramaProject, getDramaProject, listDramaProjectSummaries, updateDramaProject } from "./drama-project-store";

describe("drama project file provider", () => {
    beforeEach(() => {
        mocks.files.clear();
        mocks.provider = "file";
        mocks.postgresQuery.mockReset();
        mocks.ensurePostgresSchema.mockReset();
    });

    it("keeps projects isolated by user across create, update and delete", async () => {
        await createDramaProject("user-one", project("one", "项目一"));
        await createDramaProject("user-two", project("two", "项目二"));

        const summaries = await listDramaProjectSummaries("user-one", { page: 1, pageSize: 10 });
        expect(summaries).toMatchObject({ items: [{ id: "one", title: "项目一", episodeCount: 1, shotCount: 0 }], total: 1, page: 1, pageSize: 10 });
        expect(summaries.items[0]).not.toHaveProperty("episodes");
        expect(await getDramaProject("two", "user-one")).toBeNull();

        await expect(updateDramaProject("user-one", project("two", "越权修改"))).rejects.toMatchObject({ status: 404 });
        expect(await deleteDramaProject("user-one", "two")).toBe(false);
        expect(await deleteDramaProject("user-one", "one")).toBe(true);
        expect(await listDramaProjectSummaries("user-one")).toMatchObject({ items: [], total: 0 });
        expect((await listDramaProjectSummaries("user-two")).items).toHaveLength(1);
    });

    it("paginates lightweight summaries in the file provider", async () => {
        await createDramaProject("user-one", { ...project("one", "项目一"), updatedAt: "2026-07-28T01:00:00.000Z" });
        await createDramaProject("user-one", { ...project("two", "项目二"), updatedAt: "2026-07-28T02:00:00.000Z" });
        await createDramaProject("user-one", { ...project("three", "项目三"), updatedAt: "2026-07-28T03:00:00.000Z" });

        await expect(listDramaProjectSummaries("user-one", { page: 2, pageSize: 2 })).resolves.toMatchObject({ items: [{ id: "one" }], total: 3, page: 2, pageSize: 2 });
    });

    it("uses a bounded PostgreSQL summary query", async () => {
        mocks.provider = "postgres";
        mocks.postgresQuery.mockResolvedValue({
            rows: [
                {
                    id: "drama-one",
                    title: "项目一",
                    status: "active",
                    summary: "",
                    style: "电影感",
                    ratio: "9:16",
                    episode_count: 1,
                    character_count: 0,
                    scene_count: 0,
                    shot_count: 0,
                    pending_task_count: 0,
                    failed_task_count: 0,
                    total_count: 25,
                    created_at: "2026-07-28T01:00:00.000Z",
                    updated_at: "2026-07-28T02:00:00.000Z",
                },
            ],
        });

        await expect(listDramaProjectSummaries("user-one", { page: 2, pageSize: 12 })).resolves.toMatchObject({ total: 25, page: 2, pageSize: 12, items: [{ id: "drama-one" }] });
        expect(mocks.postgresQuery).toHaveBeenCalledWith(expect.stringMatching(/COUNT\(\*\) OVER\(\)[\s\S]*LIMIT \$2 OFFSET \$3/), ["user-one", 12, 12]);
    });

    it("persists multi-episode task state in the aggregate snapshot", async () => {
        const original = project("one", "项目一");
        await createDramaProject("user-one", original);
        const updated: DramaProject = {
            ...original,
            activeEpisodeId: "episode-two",
            episodes: [
                ...original.episodes,
                {
                    id: "episode-two",
                    title: "第 2 集",
                    script: "续集",
                    outline: "",
                    hook: "",
                    nextPreview: "",
                    sourceRange: "",
                    reviewStatus: "visual_ready",
                    shots: [
                        {
                            id: "shot-two",
                            order: 1,
                            title: "镜头 01",
                            description: "夜景",
                            sourceText: "夜景",
                            shotBoundary: "场景变化",
                            dialogue: "出发",
                            narration: "",
                            utterances: [],
                            imagePrompt: "夜景分镜",
                            videoPrompt: "镜头推进",
                            cameraMotion: "推进",
                            duration: 5,
                            characterIds: [],
                            propIds: [],
                            clueIds: [],
                            storyboardStatus: "success",
                            storyboardTaskId: "image-task",
                            storyboardImageUrl: "/api/generation-log-assets/shot.png",
                            generationStatus: "running",
                            generationTaskId: "video-task",
                            audioStatus: "queued",
                        },
                    ],
                    renderTask: { id: "render-task", status: "pending" },
                },
            ],
            updatedAt: new Date(Date.now() + 1000).toISOString(),
        };

        await updateDramaProject("user-one", updated);
        expect(await getDramaProject("one", "user-one")).toMatchObject({
            activeEpisodeId: "episode-two",
            episodes: [{ id: "episode-one" }, { id: "episode-two", shots: [{ storyboardTaskId: "image-task", generationTaskId: "video-task" }], renderTask: { id: "render-task" } }],
        });
    });

    it("rejects a stale conditional update instead of overwriting a newer snapshot", async () => {
        const original = project("one", "初始项目");
        await createDramaProject("user-one", original);
        const first = { ...original, title: "第一处修改", updatedAt: new Date(Date.parse(original.updatedAt) + 1).toISOString() };
        const stale = { ...original, title: "过期修改", updatedAt: new Date(Date.parse(original.updatedAt) + 2).toISOString() };

        await updateDramaProject("user-one", first, original.updatedAt);

        await expect(updateDramaProject("user-one", stale, original.updatedAt)).rejects.toMatchObject({ status: 409 });
        await expect(getDramaProject("one", "user-one")).resolves.toMatchObject({ title: "第一处修改" });
    });
});

function project(id: string, title: string): DramaProject {
    const now = new Date().toISOString();
    return {
        id,
        title,
        summary: "",
        style: "电影感",
        ratio: "9:16",
        status: "active",
        creativeConversationId: `conversation-${id}`,
        activeEpisodeId: "episode-one",
        characters: [],
        scenes: [],
        props: [],
        clues: [],
        defaultVideoMode: "storyboard",
        episodes: [{ id: "episode-one", title: "第 1 集", script: "", outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft", shots: [] }],
        createdAt: now,
        updatedAt: now,
    };
}
