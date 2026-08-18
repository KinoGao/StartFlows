import type { CanvasScriptAct, CanvasScriptAsset, CanvasScriptBeat } from "../types";

/**
 * 脚本节点 AI 拆解与提示词合成（对标 LibTV 脚本节点 v2 的"剧本拆解 + 资产提取"）：
 * 用文本/识图模型把剧本解析为「资产（角色/场景/道具）+ 分镜（内容/景别/时长/角色/场景/机位/台词）」，
 * 生成图片/视频提示词时引用资产描述，保证角色与场景一致性。
 */

/** 脚本 AI 拆解提示词：要求模型返回资产、幕结构与分镜 JSON。 */
export function buildScriptAiPrompt(body: string): string {
    return [
        "你是专业影视分镜师，请把下面的剧本拆解为可拍摄的分镜脚本。",
        "先完整提取资产（顺序：人物 → 道具 → 场景）：角色（人物名称 + 外貌/服装/气质描述）、道具（关键物品 + 外观描述）、场景（地点 + 环境/氛围描述）；资产是后续分镜生成时保持一致的引用基础。",
        "再识别幕/集结构：按剧情推进把整部剧本划分为若干幕（第一幕、第二幕……），每幕给出标题（如「第一幕」）、幕名（如「解读与分裂」）、梗概（一句话）和时长（如「约 45 分钟」）；剧本明确标注了幕/集/章节时严格沿用其划分与名称，不得合并或遗漏任何一幕。",
        "然后按幕顺序逐幕拆分镜（第一幕的镜头排在最前，依次排完所有幕），每个分镜给出：所属幕（如「第一幕」，与 acts 中 title 对应）、标题（2-8 字）、画面描述（主体、动作、场景、氛围，写可拍的具体画面）、景别（大远景/远景/全景/中景/近景/特写）、时长（如 \"3s\"）、角色（引用资产名）、场景（引用资产名）、机位（如 中景跟拍、特写推近）、台词（本镜对白，无则空字符串）、光影氛围（如 黄昏暖光、冷色霓虹，无则空字符串）。",
        "若剧本正文已包含明确的分镜表（幕/集标题、「场 N」场景行、「SH N / SC N / 镜 N」镜头编号），必须严格按原分镜表逐镜转换：不得增加、删除或合并镜头，beats 数量与原分镜表镜头数一致，幕与场的划分严格沿用原文；每个 beat 的 act 字段必须与 acts 中对应 title 逐字相同。",
        "画面优先：写\"人怎么干\"而非\"人干什么\"，避免抽象隐喻；镜头数量与剧本体量匹配（短剧本每幕 4-10 镜，长剧本每幕可适当增加），所有幕都要拆出分镜，不得遗漏任何一幕。",
        "分镜规范：同一场戏中角色位置、服装、道具与场景细节必须前后连贯，不得出现同一角色跨镜换装、场景对不上等跳戏；景别遵循 远-全-中-近-特 的节奏变化，情绪高点用近景/特写，交代环境用远景/全景；运镜描述写具体运动方式（推近/拉远/横移/跟拍/环绕/升降/固定），不写抽象形容词；动作连贯，相邻镜头衔接时画面元素保持空间一致性。",
        '只输出一个 JSON 对象，不要输出其他内容，格式：{"assets":[{"kind":"character"|"scene"|"prop","name":"...","description":"..."}],"acts":[{"title":"第一幕","name":"...","summary":"...","duration":"约 45 分钟"}],"beats":[{"act":"第一幕","title":"...","content":"...","shotType":"中景","duration":"3s","character":"","scene":"","camera":"","dialogue":"","atmosphere":""}]}',
        "",
        "剧本：",
        body.trim().slice(0, 12000),
    ].join("\n");
}

/** 解析模型返回的拆解 JSON（容忍代码围栏与前后说明文字）；失败返回空结构。 */
export function parseScriptAiResponse(text: string): { beats: CanvasScriptBeat[]; assets: CanvasScriptAsset[]; acts: CanvasScriptAct[] } {
    const json = extractJsonObject(text);
    if (!json) return { beats: [], assets: [], acts: [] };
    let raw: unknown;
    try {
        raw = JSON.parse(json);
    } catch {
        return { beats: [], assets: [], acts: [] };
    }
    if (!raw || typeof raw !== "object") return { beats: [], assets: [], acts: [] };
    const record = raw as Record<string, unknown>;
    const assets = (Array.isArray(record.assets) ? record.assets : []).slice(0, 40).map((item, index): CanvasScriptAsset | null => {
        if (!item || typeof item !== "object") return null;
        const asset = item as Record<string, unknown>;
        const name = typeof asset.name === "string" ? asset.name.trim() : "";
        const kind = typeof asset.kind === "string" && ["character", "scene", "prop"].includes(asset.kind) ? asset.kind : "character";
        if (!name) return null;
        return {
            id: `asset-${index + 1}`,
            kind: kind as CanvasScriptAsset["kind"],
            name: name.slice(0, 24),
            description: typeof asset.description === "string" ? asset.description.trim().slice(0, 200) : "",
        };
    }).filter((asset): asset is CanvasScriptAsset => Boolean(asset));
    const acts = (Array.isArray(record.acts) ? record.acts : []).slice(0, 40).map((item, index): CanvasScriptAct | null => {
        if (!item || typeof item !== "object") return null;
        const act = item as Record<string, unknown>;
        const title = typeof act.title === "string" ? act.title.trim() : "";
        if (!title) return null;
        return {
            id: `act-${index + 1}`,
            title: title.slice(0, 32),
            name: typeof act.name === "string" ? act.name.trim().slice(0, 48) : undefined,
            summary: typeof act.summary === "string" ? act.summary.trim().slice(0, 200) : undefined,
            duration: typeof act.duration === "string" ? act.duration.trim().slice(0, 32) : undefined,
        };
    }).filter((act): act is CanvasScriptAct => Boolean(act));
    // 长剧本分镜可能很多，不设硬性截断上限（保留全部幕的镜头，避免第二幕等被截断丢失）。
    const beats = (Array.isArray(record.beats) ? record.beats : []).map((item, index): CanvasScriptBeat | null => {
        if (!item || typeof item !== "object") return null;
        const beat = item as Record<string, unknown>;
        const content = typeof beat.content === "string" ? beat.content.trim() : "";
        const title = (typeof beat.title === "string" && beat.title.trim()) || content.slice(0, 12) || `分镜 ${index + 1}`;
        if (!content && !title) return null;
        const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
        const draft: CanvasScriptBeat = {
            id: `beat-${index + 1}`,
            title: title.slice(0, 24),
            content: content || title,
            shotType: text(beat.shotType) || undefined,
            duration: text(beat.duration) || undefined,
            character: text(beat.character) || undefined,
            scene: text(beat.scene) || undefined,
            camera: text(beat.camera) || undefined,
            dialogue: text(beat.dialogue) || undefined,
            atmosphere: text(beat.atmosphere) || undefined,
            act: text(beat.act) || undefined,
            prompt: "",
        };
        return { ...draft, prompt: buildScriptBeatPrompt(draft, assets) };
    }).filter((beat): beat is CanvasScriptBeat => Boolean(beat));
    return { beats, assets, acts };
}

/** 从模型回复中提取第一个 JSON 对象（容忍代码围栏与前后说明文字）。 */
function extractJsonObject(text: string): string | null {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenced ? fenced[1] : text;
    const start = candidate.indexOf("{");
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < candidate.length; index += 1) {
        const char = candidate[index];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === "\\") {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;
        if (char === "{") depth += 1;
        else if (char === "}") {
            depth -= 1;
            if (depth === 0) return candidate.slice(start, index + 1);
        }
    }
    return null;
}

/** 合成单个分镜的生成提示词：镜头内容 + 景别/机位 + 角色/场景资产描述 + 台词。 */
export function buildScriptBeatPrompt(
    beat: Pick<CanvasScriptBeat, "title" | "content" | "shotType" | "camera" | "character" | "scene" | "dialogue" | "atmosphere">,
    assets: CanvasScriptAsset[] = [],
): string {
    const parts: string[] = [`根据脚本分镜生成画面：${beat.content || beat.title}`];
    if (beat.shotType) parts.push(`景别：${beat.shotType}`);
    if (beat.camera) parts.push(`机位：${beat.camera}`);
    const findAsset = (name: string | undefined) => (name ? assets.find((asset) => asset.name === name) : undefined);
    const character = findAsset(beat.character);
    if (character?.description) parts.push(`角色「${character.name}」：${character.description}`);
    else if (beat.character) parts.push(`角色：${beat.character}`);
    const scene = findAsset(beat.scene);
    if (scene?.description) parts.push(`场景「${scene.name}」：${scene.description}`);
    else if (beat.scene) parts.push(`场景：${beat.scene}`);
    if (beat.atmosphere) parts.push(`光影氛围：${beat.atmosphere}`);
    if (beat.dialogue) parts.push(`台词：${beat.dialogue}`);
    parts.push("要求画面有清晰主体、镜头景别、动作和氛围，电影感构图。");
    return parts.join("；");
}

/** 资产设定图提示词：用资产名 + 描述生成人物/道具/场景设定图。 */
export function buildAssetPrompt(asset: CanvasScriptAsset): string {
    const kindLabel = asset.kind === "character" ? "角色" : asset.kind === "scene" ? "场景" : "道具";
    const subject = kindLabel === "角色" ? "全身正面、动作自然、表情清晰" : "完整呈现、细节清晰";
    return `${kindLabel}设定图：${asset.name}。${asset.description}。要求：${subject}，干净背景，风格统一，电影质感。`;
}

/** 分镜图提示词：用户显式覆盖优先，否则按分镜字段 + 资产描述自动合成（用于两段式的分镜帧生图）。 */
export function resolveScriptBeatImagePrompt(beat: Pick<CanvasScriptBeat, "imagePrompt" | "title" | "content" | "shotType" | "camera" | "character" | "scene" | "dialogue">, assets: CanvasScriptAsset[] = []): string {
    return beat.imagePrompt?.trim() || buildScriptBeatPrompt(beat, assets);
}

/** 视频运动提示词：用户显式覆盖优先，否则回退整段导出文本（免费拼接路径）。 */
export function resolveScriptBeatVideoPrompt(beat: CanvasScriptBeat): string {
    return beat.videoPrompt?.trim() || buildScriptBeatExportText(beat);
}

/** 智能合成提示词：让文本模型为单个分镜同时产出分镜图提示词与结构化视频运动提示词。 */
export function buildScriptBeatPromptsSynthPrompt(beat: CanvasScriptBeat, assets: CanvasScriptAsset[] = []): string {
    const findAsset = (name: string | undefined) => (name ? assets.find((asset) => asset.name === name) : undefined);
    const character = findAsset(beat.character);
    const scene = findAsset(beat.scene);
    return [
        "你是专业影视分镜师，请为下面的分镜同时撰写两条提示词。",
        "1. imagePrompt：分镜帧静帧生图提示词，写清主体、动作、场景、光影氛围、景别与构图；给定角色/场景资产描述时必须原样融入，保证跨镜一致性。",
        "2. videoPrompt：视频运动提示词，按「起始状态 → 动作过程（按秒分解，如 开头约1秒…／中段第3秒…）→ 结束状态（镜头落幅）→ 音效 → 配乐」结构化撰写。",
        '只输出一个 JSON 对象，不要输出其他内容：{"imagePrompt":"...","videoPrompt":"..."}',
        "",
        `分镜标题：${beat.title}`,
        `画面描述：${beat.content}`,
        beat.shotType ? `景别：${beat.shotType}` : "",
        beat.camera ? `机位/运镜：${beat.camera}` : "",
        beat.duration ? `时长：${beat.duration}` : "",
        character ? `角色「${character.name}」：${character.description}` : beat.character ? `角色：${beat.character}` : "",
        scene ? `场景「${scene.name}」：${scene.description}` : beat.scene ? `场景：${beat.scene}` : "",
        beat.dialogue ? `台词：${beat.dialogue}` : "",
        beat.soundEffect ? `音效：${beat.soundEffect}` : "",
        beat.atmosphere ? `光影氛围：${beat.atmosphere}` : "",
    ]
        .filter(Boolean)
        .join("\n");
}

/** 解析智能合成响应（容忍代码围栏与说明文字）；失败返回空对象。 */
export function parseScriptBeatPromptsResponse(text: string): { imagePrompt?: string; videoPrompt?: string } {
    const json = extractJsonObject(text);
    if (!json) return {};
    try {
        const raw = JSON.parse(json) as Record<string, unknown>;
        const imagePrompt = typeof raw.imagePrompt === "string" ? raw.imagePrompt.trim() : "";
        const videoPrompt = typeof raw.videoPrompt === "string" ? raw.videoPrompt.trim() : "";
        return { ...(imagePrompt ? { imagePrompt } : {}), ...(videoPrompt ? { videoPrompt } : {}) };
    } catch {
        return {};
    }
}

/** 分镜导出文本：把幕/景别/时长/标题/画面描述/角色场景机位/台词排布为可直接填入视频或 ComfyUI 节点 composer 的提示词。 */
export function buildScriptBeatExportText(beat: CanvasScriptBeat): string {
    const header = [beat.act, beat.sceneHeading, beat.shotType, beat.duration].filter((item): item is string => Boolean(item)).join("    ");
    const refs = [beat.character, beat.scene, beat.camera].filter((item): item is string => Boolean(item));
    const lines = [header, beat.title, beat.content].filter(Boolean);
    if (refs.length) lines.push("—", ...refs);
    if (beat.dialogue) lines.push(`台词：${beat.dialogue}`);
    if (beat.soundEffect) lines.push(`音效：${beat.soundEffect}`);
    if (beat.atmosphere) lines.push(`光影氛围：${beat.atmosphere}`);
    return lines.join("\n");
}
