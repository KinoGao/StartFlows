import type { CreativeGenerationPreferences, CreativeSurface } from "@/lib/creative-runtime-contract";
import type { AgentSkillWorkspace } from "@/lib/auth/store";
import { canvasSnapshotPlanningFacts } from "./agent-run-canvas-snapshot";

type PlanningRun = {
    surface: CreativeSurface;
    prompt: string;
    snapshot?: unknown;
    generationPreferences?: CreativeGenerationPreferences;
};

type ModelOption = {
    capability: string;
};

export type AgentPlanningProfile = {
    complexity: "ordinary" | "multi" | "complex";
    capabilities: Set<string>;
    skillWorkspaces: Set<AgentSkillWorkspace>;
};

const CREATIVE_ACTION_RE = /生成|制作|创作|设计|改写|润色|优化|编辑|修改|调整|修复|重绘|配音|旁白|动起来|转视频|做(?:一|个|张|条|份|套|组)/u;
const IMAGE_RE = /图片|图像|生图|海报|插画|封面|角色图|场景图|立绘|照片|写真|主视觉|商品图|详情页|修图|美颜/u;
const VIDEO_RE = /视频|短片|动画|动效|镜头|运镜|图生视频|文生视频|动起来/u;
const AUDIO_RE = /音频|配音|旁白|语音|声音|音效|音乐|朗读/u;
const TEXT_RE = /文本|文案|脚本|剧本|台词|提示词|标题|描述|文章|口播稿|改写|润色/u;
const MULTI_RE = /多张|多个|多条|多份|批量|系列|一套|一组|[2-9二三四五六七八九十]\s*(?:张|个|条|份|款|版)/u;
const COMPLEX_RE = /短剧|分镜|故事板|多物料|完整方案|全套|角色.+场景|场景.+角色|品牌系列|项目规划/u;

export function resolveAgentPlanningProfile(run: PlanningRun): AgentPlanningProfile {
    const prompt = run.prompt.trim();
    const canvasFacts = run.surface === "canvas" ? canvasSnapshotPlanningFacts(run.snapshot) : undefined;
    const selectedTypes = new Set(canvasFacts?.selectedNodeTypes || []);
    const capabilities = run.generationPreferences?.mode ? new Set(["text", run.generationPreferences.mode]) : inferCapabilities(run.surface, prompt, selectedTypes);
    const complex = run.surface === "drama" || COMPLEX_RE.test(prompt) || (run.surface === "canvas" && (canvasFacts?.nodeCount || 0) > 10);
    const multi = complex || MULTI_RE.test(prompt);
    const complexity = complex ? "complex" : multi ? "multi" : "ordinary";
    return {
        complexity,
        capabilities,
        skillWorkspaces: skillWorkspaces(run.surface, capabilities),
    };
}

export function filterAgentPlannerModels<T extends ModelOption>(models: T[], run: PlanningRun) {
    const capabilities = resolveAgentPlanningProfile(run).capabilities;
    return models.filter((model) => capabilities.has(model.capability));
}

function inferCapabilities(surface: CreativeSurface, prompt: string, selectedTypes: Set<string>) {
    if (surface === "drama") return new Set(["text", "image", "video", "audio"]);
    const capabilities = new Set<string>(["text"]);
    if (IMAGE_RE.test(prompt)) capabilities.add("image");
    if (VIDEO_RE.test(prompt)) {
        capabilities.add("video");
        capabilities.add("image");
    }
    if (AUDIO_RE.test(prompt)) capabilities.add("audio");
    if (TEXT_RE.test(prompt)) capabilities.add("text");
    if (capabilities.size === 1 && CREATIVE_ACTION_RE.test(prompt)) {
        for (const type of selectedTypes) if (["text", "image", "video", "audio"].includes(type)) capabilities.add(type);
        if (capabilities.size === 1) for (const type of ["image", "video", "audio"]) capabilities.add(type);
    }
    return capabilities;
}

function skillWorkspaces(surface: CreativeSurface, capabilities: Set<string>) {
    if (surface === "canvas") return new Set<AgentSkillWorkspace>(["canvas"]);
    if (surface === "drama") return new Set<AgentSkillWorkspace>(["drama"]);
    const workspaces = new Set<AgentSkillWorkspace>();
    if (capabilities.has("image")) workspaces.add("image");
    if (capabilities.has("video")) {
        workspaces.add("video");
        workspaces.add("image");
    }
    return workspaces;
}
