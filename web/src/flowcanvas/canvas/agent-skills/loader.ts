import { artSkillLabel, directorSkillLabel, storySkillLabel } from "./options";
import { skillFileTexts } from "./manifest";

/**
 * 按需加载 Toonflow 风格 skill 的文本定义（README / prefix），
 * 供在线 Agent 注入系统提示词。skill 源文件位于 canvas-agent，这里只保留
 * 纯文本定义副本（不含参考图）。Next.js 版：文本在构建期写入 manifest.ts。
 */
const skillFiles: Record<string, () => Promise<string>> = Object.fromEntries(Object.entries(skillFileTexts).map(([key, value]) => [key, () => Promise.resolve(value)]));

function skillPath(kind: "art_skills" | "story_skills" | "director_skills", id: string, file: string) {
    return `../agent-skills/${kind}/${id}/${file}.md`;
}

async function loadText(kind: "art_skills" | "story_skills" | "director_skills", id: string, file: string): Promise<string> {
    const loader = skillFiles[skillPath(kind, id, file)];
    if (!loader) return "";
    try {
        const content = await loader();
        return (content || "").trim();
    } catch {
        return "";
    }
}

/** 美术风格 skill 内容：README + prefix（风格基因 / 色彩盘 / 约束）。 */
export async function loadArtSkill(id: string): Promise<string> {
    const [readme, prefix] = await Promise.all([
        loadText("art_skills", id, "README"),
        loadText("art_skills", id, "prefix"),
    ]);
    const parts = [`## 美术风格：${artSkillLabel(id)}`];
    if (readme) parts.push(readme);
    if (prefix) parts.push(`### 提示词前缀\n\n${prefix}`);
    return parts.join("\n\n");
}

/** 故事风格 skill 内容：README（题材定义 / 叙事约束）。 */
export async function loadStorySkill(id: string): Promise<string> {
    const readme = await loadText("story_skills", id, "README");
    if (!readme) return "";
    return `## 故事风格：${storySkillLabel(id)}\n\n${readme}`;
}

/** 导演风格 skill 内容：README（镜头语言 / 光线色彩 / 运镜构图 / 提示词约束）。 */
export async function loadDirectorSkill(id: string): Promise<string> {
    const readme = await loadText("director_skills", id, "README");
    if (!readme) return "";
    return `## 导演风格：${directorSkillLabel(id)}\n\n${readme}`;
}
