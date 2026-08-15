export const CHARACTER_DESIGN_SKILL = {
    id: "character-design",
    name: "角色设定",
    description: "建立可持续复用的角色外观、服装、表情和多视图设定。",
    enabled: true,
    workspaces: ["image", "canvas", "drama"],
    action: "generate",
    requiresReference: false,
    defaultConfig: { quality: "high", count: 4 },
    keywords: ["角色设定", "角色设计", "人物设定", "角色图", "人物立绘", "多视图", "角色表"],
    instructions: `以角色设定工作流执行。先提炼身份、年龄、体态、脸部特征、发型、服装材质、配色、道具和情绪关键词，再生成同一角色的正面、侧面、背面和表情/动作参考。所有视图必须保持身份、比例、服装结构、发型轮廓和关键道具一致；采用清晰的角色设定板构图，给后续短剧、分镜和连续图片复用。不要随意改变种族、年龄、服装或脸部特征，也不要把四个视图生成成不同的人。`,
} as const;

export const IMAGE_MOTION_SKILL = {
    id: "image-motion",
    name: "图片动效",
    description: "把静态画面转成主体稳定、动作自然的短视频。",
    sourceUrl: "https://github.com/ArcReel/ArcReel",
    sourceVersion: "1.0.0",
    license: "MIT",
    enabled: true,
    workspaces: ["video"],
    action: "edit",
    requiresReference: true,
    defaultConfig: { videoSeconds: 5, vquality: "720" },
    keywords: ["图片动效", "图生视频", "图片转视频", "动效", "动画", "镜头推进", "首帧"],
    instructions: `以图生视频工作流执行。必须使用用户提供的参考图作为主体和首帧，保持人物、商品、场景、构图、色彩和文字位置稳定，只规划明确的动作、镜头运动、景别、速度和时长。默认生成 5 秒短视频；避免新增人物、改变主体身份、重绘商品 Logo、过度运动、闪烁和不必要的场景切换。`,
} as const;

export const DRAMA_PLANNING_SKILL = {
    id: "drama-planning",
    name: "短剧策划",
    description: "从主题到角色、场景和分镜，整理可继续生产的短剧方案。",
    sourceUrl: "https://github.com/ArcReel/ArcReel",
    sourceVersion: "1.0.0",
    license: "MIT",
    enabled: true,
    workspaces: ["image", "video", "drama"],
    action: "generate",
    requiresReference: false,
    defaultConfig: { count: 1, videoSeconds: 5 },
    keywords: ["短剧策划", "短剧", "剧本", "分镜", "剧集", "镜头", "故事板"],
    instructions: `以短剧生产工作流执行。先整理主题、受众、冲突、角色、场景、道具和叙事节奏，再拆成可审核的剧集与镜头；每个镜头明确画面主体、对白/旁白、时长、景别、机位和动作，并为后续角色图、场景图和视频任务保留稳定引用。不要直接跳过结构分析，也不要在用户未明确要求时擅自创建 Canvas 或短剧项目。`,
} as const;

export const DEFAULT_CREATIVE_SHORTCUT_SKILLS = [CHARACTER_DESIGN_SKILL, IMAGE_MOTION_SKILL, DRAMA_PLANNING_SKILL] as const;
