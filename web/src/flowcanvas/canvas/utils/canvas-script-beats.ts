import type { CanvasScriptAct, CanvasScriptBeat } from "../types";

const SCRIPT_SHOT_TYPES = [
    ["大远景", "大远景|鸟瞰|航拍"],
    ["远景", "远景|全景远景"],
    ["全景", "全景|全身"],
    ["中景", "中景|腰部以上"],
    ["近景", "近景|胸部以上"],
    ["特写", "特写|细节|脸部|眼睛|手部"],
] as const;

export function inferScriptShotType(content: string) {
    const match = SCRIPT_SHOT_TYPES.find(([, pattern]) => new RegExp(pattern).test(content));
    return match?.[0];
}

export function inferScriptDuration(content: string) {
    const seconds = content.match(/(\d+)\s*秒/);
    return seconds ? `${seconds[1]}s` : "3s";
}

/** 镜行：SH1 / SC1 / 镜 1 开头，如「SH1 大远景 拉远：画面内容。（台词：…）」 */
const SHOT_LINE_PATTERN = /^((?:SH|SC|镜)\s*\d+)\s*[:：]?\s*(.*)$/i;
/** 幕/集/章行：◆ 第一幕「探测」· 约 30 分钟 */
const ACT_LINE_PATTERN = /^[◆◇\s]*第\s*([一二三四五六七八九十百零\d]+)\s*([幕集章])/;
/** 场行：场 1 · A 控制室 · 深夜 */
const SCENE_LINE_PATTERN = /^场\s*\d+/;
/** 运镜描述里需要剥离的景别词（顺序保证 大远景/全景远景 先于 远景 命中） */
const SHOT_KEYWORD_PATTERN = /大远景|鸟瞰|航拍|全景远景|远景|全景|全身|中景|腰部以上|近景|胸部以上|特写|细节|脸部|眼睛|手部/g;

/**
 * 解析剧本正文中明确写出的分镜表（幕/集标题 + 场 N + SH/SC/镜 N 编号），
 * 产出带幕归属、场标题、景别、运镜、台词的完整分镜，不截断。
 * 正文不含镜行时返回 null，调用方走普通行切分兜底。
 */
export function parseStructuredScriptBeats(body: string): { acts: CanvasScriptAct[]; beats: CanvasScriptBeat[] } | null {
    const lines = body
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
    const shotLineCount = lines.filter((line) => SHOT_LINE_PATTERN.test(line)).length;
    const hasHeader = lines.some((line) => ACT_LINE_PATTERN.test(line) || SCENE_LINE_PATTERN.test(line));
    if (!shotLineCount || (shotLineCount < 2 && !hasHeader)) return null;

    const acts: CanvasScriptAct[] = [];
    const beats: CanvasScriptBeat[] = [];
    let currentAct: string | undefined;
    let currentScene: string | undefined;
    lines.forEach((line) => {
        const actMatch = line.match(ACT_LINE_PATTERN);
        if (actMatch) {
            const title = `第${actMatch[1]}${actMatch[2]}`;
            currentAct = title;
            currentScene = undefined;
            if (!acts.some((act) => act.title === title)) {
                const name = line.match(/[「《]([^」》]+)[」》]/)?.[1]?.trim();
                const duration = line.match(/约?\s*[\d.]+\s*分钟/)?.[0].replace(/\s+/g, "");
                acts.push({ id: `act-${acts.length + 1}`, title, name: name || undefined, duration: duration || undefined });
            }
            return;
        }
        if (SCENE_LINE_PATTERN.test(line)) {
            currentScene = line;
            return;
        }
        const shotMatch = line.match(SHOT_LINE_PATTERN);
        if (!shotMatch) return;
        const label = shotMatch[1].replace(/\s+/g, "").toUpperCase();
        const rest = shotMatch[2].trim();
        const colonIndex = rest.search(/[：:]/);
        const head = colonIndex >= 0 ? rest.slice(0, colonIndex).trim() : "";
        let content = (colonIndex >= 0 ? rest.slice(colonIndex + 1) : rest).trim();
        const dialogueMatch = content.match(/[（(]\s*台词\s*[：:]\s*([^）)]*)[）)]/);
        const dialogue = dialogueMatch?.[1]?.trim();
        if (dialogueMatch) content = content.replace(dialogueMatch[0], "").trim();
        const shotType = inferScriptShotType(head || content);
        let camera: string | undefined;
        if (head) {
            const cleaned = head
                .replace(SHOT_KEYWORD_PATTERN, "")
                .replace(/^[/\s，,、]+|[/\s，,、]+$/g, "")
                .trim();
            camera = cleaned || undefined;
        }
        beats.push({
            id: `beat-${beats.length + 1}`,
            title: label,
            content: content || label,
            shotType,
            duration: inferScriptDuration(content),
            camera,
            dialogue: dialogue || undefined,
            act: currentAct,
            sceneHeading: currentScene,
            prompt: `根据脚本分镜生成画面：${content || label}。要求画面有清晰主体、镜头景别、动作和氛围，电影感构图。`,
        });
    });
    return beats.length ? { acts, beats } : null;
}

/** 普通剧本的行切分兜底：每行一个分镜，最多 6 条骨架。 */
function buildLineScriptBeats(body: string): CanvasScriptBeat[] {
    const lines = body
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean);
    const chunks = lines.length
        ? lines
        : body
              .split(/[。！？.!?]+/)
              .map((line) => line.trim())
              .filter(Boolean);
    const source = chunks.length ? chunks.slice(0, 6) : ["建立场景", "角色行动", "情绪高潮"];
    return source.map((content, index) => {
        const clean = content.replace(/^\d+[.、\s]*/, "");
        const title = clean.match(/^([^：:]{2,18})[：:]/)?.[1] || `分镜 ${index + 1}`;
        return {
            id: `beat-${index + 1}`,
            title,
            content: clean,
            shotType: inferScriptShotType(clean),
            duration: inferScriptDuration(clean),
            prompt: `根据脚本分镜生成画面：${clean}。要求画面有清晰主体、镜头景别、动作和氛围，电影感构图。`,
        };
    });
}

/** 拆分镜入口：正文含明确分镜表（幕/场/镜编号）时按原表解析并给出幕结构，否则行切分兜底。 */
export function buildScriptBeatsWithActs(body: string): { beats: CanvasScriptBeat[]; acts: CanvasScriptAct[] } {
    const structured = parseStructuredScriptBeats(body);
    if (structured) return structured;
    return { beats: buildLineScriptBeats(body), acts: [] };
}

export function buildScriptBeats(body: string): CanvasScriptBeat[] {
    return buildScriptBeatsWithActs(body).beats;
}

export const GRID_SHOT_DESCRIPTIONS = [
    "大远景，交代环境",
    "远景，展现空间关系",
    "全景，主体完整入画",
    "中景，人物腰部以上",
    "近景，人物胸部以上",
    "特写，强调细节情绪",
    "大特写，聚焦局部",
    "俯拍，俯瞰视角",
    "仰拍，低机位仰视",
    "过肩镜头，带前景",
];

export function buildGridBeatPrompt(body: string, beat: Pick<CanvasScriptBeat, "title" | "content"> | undefined, index: number, count: number) {
    const shot = GRID_SHOT_DESCRIPTIONS[index % GRID_SHOT_DESCRIPTIONS.length];
    const source = beat?.content?.trim() || body.trim().slice(0, 80);
    return `根据脚本分镜生成画面（第 ${index + 1}/${count} 格，${shot}）：${source}。保持主体、场景和风格一致，电影感构图。`;
}
