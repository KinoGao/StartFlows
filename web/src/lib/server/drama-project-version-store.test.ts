import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DramaProject } from "@/lib/drama-project-contract";

const mocks = vi.hoisted(() => ({ files: new Map<string, unknown>() }));

vi.mock("@/lib/server/database", () => ({
    ensurePostgresSchema: vi.fn(),
    getDatabaseProvider: vi.fn(() => "file"),
    postgresQuery: vi.fn(),
    withPostgresTransaction: vi.fn(),
}));
vi.mock("@/lib/server/data-adapter", () => ({
    readJsonDataFile: vi.fn(async (name: string, fallback: unknown) => structuredClone(mocks.files.has(name) ? mocks.files.get(name) : fallback)),
    writeJsonDataFile: vi.fn(async (name: string, value: unknown) => mocks.files.set(name, structuredClone(value))),
}));

import { createDramaProjectVersion, getDramaProjectVersion, listDramaProjectVersions } from "./drama-project-version-store";

describe("drama project version file provider", () => {
    beforeEach(() => mocks.files.clear());

    it("increments versions and isolates projects by user", async () => {
        const first = await createDramaProjectVersion("user-one", "project-one", "初稿", project("project-one", "初稿"));
        const second = await createDramaProjectVersion("user-one", "project-one", "调整分镜", project("project-one", "调整"));
        await createDramaProjectVersion("user-two", "project-one", "其他用户", project("project-one", "越权"));

        expect([first.version, second.version]).toEqual([1, 2]);
        expect(await listDramaProjectVersions("user-one", "project-one")).toMatchObject([
            { version: 2, reason: "调整分镜" },
            { version: 1, reason: "初稿" },
        ]);
        expect(await getDramaProjectVersion("user-one", "project-one", second.id)).toMatchObject({ snapshot: { title: "调整" } });
        expect(await getDramaProjectVersion("user-two", "project-one", second.id)).toBeNull();
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
