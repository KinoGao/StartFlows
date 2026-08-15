import { describe, expect, it } from "vitest";

import type { DramaEpisode, DramaProject, DramaShot } from "./drama-project-contract";
import { compileDramaAssetReferencePrompt, compileDramaShotPrompts } from "./drama-prompt-compiler";

describe("drama prompt compiler", () => {
    it("compiles project assets and continuity into both media prompts", () => {
        const project = createProject();
        const prompts = compileDramaShotPrompts(project, project.episodes[0], project.episodes[0].shots[0]);

        expect(prompts.imagePrompt).toContain("统一风格：现实电影感");
        expect(prompts.imagePrompt).toContain("女主：红色外套");
        expect(prompts.imagePrompt).toContain("轴线 保持同侧");
        expect(prompts.startFramePrompt).toContain("动作起始");
        expect(prompts.endFramePrompt).toContain("动作结束");
        expect(prompts.videoPrompt).toContain("从“动作起始”自然过渡到“动作结束”");
    });

    it("creates a focused asset reference brief", () => {
        const prompt = compileDramaAssetReferencePrompt(createProject(), createProject().characters[0], "角色");

        expect(prompt).toContain("角色设定图");
        expect(prompt).toContain("固定色彩：红黑");
        expect(prompt).toContain("不添加文字");
    });

    it("preserves long execution prompts instead of truncating the final constraints", () => {
        const project = createProject();
        project.characters[0].description = `${"角色细节".repeat(2500)}最终识别标记`;

        const prompts = compileDramaShotPrompts(project, project.episodes[0], project.episodes[0].shots[0]);
        const assetPrompt = compileDramaAssetReferencePrompt(project, project.characters[0], "角色");

        expect(prompts.imagePrompt.length).toBeGreaterThan(8000);
        expect(prompts.imagePrompt).toContain("最终识别标记");
        expect(assetPrompt.length).toBeGreaterThan(8000);
        expect(assetPrompt).toContain("最终识别标记");
    });
});

function createProject(): DramaProject {
    const shot: DramaShot = {
        id: "shot-one",
        order: 1,
        title: "发现",
        description: "女主发现门边的血迹",
        sourceText: "她在门边停下。",
        shotBoundary: "发现后切镜",
        dialogue: "怎么回事？",
        narration: "",
        utterances: [],
        imagePrompt: "冷色天台",
        videoPrompt: "她抬头看向门口",
        cameraMotion: "缓慢推进",
        duration: 5,
        characterIds: ["character-one"],
        propIds: [],
        clueIds: [],
        sceneId: "scene-one",
        continuity: {
            shotSize: "中景",
            cameraAngle: "平视",
            composition: "人物在右侧",
            characterBlocking: "女主站在门边",
            gazeDirection: "看向左侧",
            actionStart: "动作起始",
            actionEnd: "动作结束",
            screenDirection: "向左",
            axisRule: "保持同侧",
            continuityNotes: "门把手位置不变",
        },
    };
    const episode: DramaEpisode = { id: "episode-one", title: "第 1 集", script: "", outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "visual_ready", shots: [shot] };
    return {
        id: "drama-one",
        title: "测试短剧",
        summary: "",
        style: "现实电影感",
        ratio: "9:16",
        status: "active",
        activeEpisodeId: episode.id,
        characters: [
            {
                id: "character-one",
                name: "女主",
                description: "红色外套",
                profile: { visualIdentity: "短发", styling: "红色外套", colorPalette: "红黑", consistencyRules: "发型不变" },
            },
        ],
        scenes: [{ id: "scene-one", name: "天台", description: "雨夜", profile: { visualIdentity: "高楼天台", styling: "湿润水泥", colorPalette: "蓝灰", consistencyRules: "保持门在左侧" } }],
        props: [],
        clues: [],
        defaultVideoMode: "storyboard",
        episodes: [episode],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}
