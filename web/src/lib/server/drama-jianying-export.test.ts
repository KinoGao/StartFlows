import { writeFile } from "node:fs/promises";

import { unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

import type { DramaEpisode, DramaProject, DramaShot } from "@/lib/drama-project-contract";

vi.mock("@/lib/server/media-download", () => ({
    downloadMediaToFile: vi.fn(async (_url: string, path: string) => {
        await writeFile(path, new Uint8Array([0, 0, 0, 0]));
        return { bytes: 4, mimeType: "video/mp4" };
    }),
}));

import { buildJianyingDraftName, DramaJianyingExportError, exportDramaEpisodeAsJianying } from "./drama-jianying-export";

describe("Jianying draft export", () => {
    it("sanitizes the draft folder name", () => {
        expect(buildJianyingDraftName("月影:长安", "第/1集")).toBe("月影_长安_第_1集");
    });

    it("creates a self-contained version 5 draft zip", async () => {
        const result = await exportDramaEpisodeAsJianying({ project: project(), episode: episode([shot()]), draftPath: "C:\\JianyingDrafts", version: "5", origin: "http://127.0.0.1:3000" });
        const entries = Object.keys(unzipSync(result.data));
        expect(entries).toEqual(expect.arrayContaining([expect.stringMatching(/draft_content\.json$/), expect.stringMatching(/draft_meta_info\.json$/), expect.stringMatching(/assets\/segment_001\.mp4$/)]));
    });

    it("rejects episodes without completed video", async () => {
        await expect(exportDramaEpisodeAsJianying({ project: project(), episode: episode([]), draftPath: "C:\\JianyingDrafts", version: "6", origin: "http://127.0.0.1:3000" })).rejects.toEqual(
            expect.objectContaining<Partial<DramaJianyingExportError>>({ status: 422 }),
        );
    });
});

function project(): DramaProject {
    const now = new Date().toISOString();
    const currentEpisode = episode([shot()]);
    return {
        id: "project-one",
        title: "测试短剧",
        summary: "",
        style: "电影感",
        ratio: "9:16",
        status: "active",
        activeEpisodeId: currentEpisode.id,
        characters: [],
        scenes: [],
        props: [],
        clues: [],
        defaultVideoMode: "storyboard",
        episodes: [currentEpisode],
        createdAt: now,
        updatedAt: now,
    };
}

function episode(shots: DramaShot[]): DramaEpisode {
    return { id: "episode-one", title: "第 1 集", script: "", outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "visual_ready", shots };
}

function shot(): DramaShot {
    return {
        id: "shot-one",
        order: 1,
        title: "开场",
        description: "夜景",
        sourceText: "夜幕降临",
        shotBoundary: "开场",
        dialogue: "出发",
        narration: "",
        utterances: [],
        imagePrompt: "夜景",
        videoPrompt: "推进",
        cameraMotion: "推进",
        duration: 5,
        characterIds: [],
        propIds: [],
        clueIds: [],
        videoUrl: "/api/media/video.mp4",
        subtitle: "出发",
    };
}
