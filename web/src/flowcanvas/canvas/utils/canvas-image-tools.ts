/**
 * LibTV 图像工具集预设：扩图 / 抠图 / 720° 全景 / 打光调节 / 蒙版擦除。
 * 均以提示词预设形式接入图生图编辑管线（runImageReferenceEdit），
 * 与「快捷功能」一致；原图提示词作为补充上下文帮助模型保持一致性。
 */

function withBasePrompt(preset: string, basePrompt?: string) {
    const base = basePrompt?.trim();
    return base ? `${preset}\n原画面描述：${base}` : preset;
}

/** 扩图目标画幅预设 */
export type CanvasOutpaintRatio = {
    id: string;
    label: string;
    width: number;
    height: number;
};

export const OUTPAINT_RATIOS: CanvasOutpaintRatio[] = [
    { id: "1:1", label: "1:1", width: 1, height: 1 },
    { id: "4:3", label: "4:3", width: 4, height: 3 },
    { id: "3:4", label: "3:4", width: 3, height: 4 },
    { id: "16:9", label: "16:9", width: 16, height: 9 },
    { id: "9:16", label: "9:16", width: 9, height: 16 },
    { id: "21:9", label: "21:9", width: 21, height: 9 },
];

/** 扩图：以当前图为参考向外延展补全画面到目标画幅 */
export function buildOutpaintPrompt(ratioId: string, basePrompt?: string) {
    const ratio = OUTPAINT_RATIOS.find((item) => item.id === ratioId) || OUTPAINT_RATIOS[0];
    const preset = `以参考图为基础向外扩展画面到 ${ratio.label} 画幅（宽:高 = ${ratio.width}:${ratio.height}），自然延展补全画面四周的场景、背景与光影。新增区域与参考图的内容、透视、色调和画风无缝衔接，参考图中心区域的主体保持不变。`;
    return withBasePrompt(preset, basePrompt);
}

/** 抠图：提取画面主体并替换为干净纯色背景 */
export function buildCutoutPrompt(basePrompt?: string) {
    const preset = "以参考图为基础，提取画面中的核心主体（人物、产品或关键物体），完整保留主体的外观、细节和边缘，移除原有背景并替换为干净的纯白色背景，生成主体抠图结果。";
    return withBasePrompt(preset, basePrompt);
}

/** 720° 全景：以参考图的场景为起点生成 equirectangular 全景图 */
export function buildPanorama720Prompt(basePrompt?: string) {
    const preset =
        "以参考图的场景为起点，生成一张 720° 全景图（equirectangular 等距柱状投影格式，2:1 宽高比）：水平方向完整环绕 360°，垂直方向覆盖天顶与地面，左右边缘无缝衔接。保持参考图的场景内容、光影氛围和画风一致，画面透视符合全景投影规律。";
    return withBasePrompt(preset, basePrompt);
}

/** 蒙版擦除：移除涂抹区域内容并自然补全背景（配合局部编辑弹窗的「AI 擦除」使用） */
export const IMAGE_ERASE_PROMPT = "移除蒙版涂抹区域内的物体、人物或杂物，用周围背景自然补全该区域，补全内容与原图的场景、光影、色调和画风无缝衔接，看不出修改痕迹。";

/** 打光调节选项 */
export type CanvasLightingOption = {
    id: string;
    label: string;
    /** 组合进打光提示词的光照描述 */
    prompt: string;
};

/** 主光方向预设 */
export const LIGHTING_DIRECTIONS: CanvasLightingOption[] = [
    { id: "top-left", label: "左上光", prompt: "主光源来自画面左上方" },
    { id: "top-right", label: "右上光", prompt: "主光源来自画面右上方" },
    { id: "side", label: "正侧光", prompt: "正侧面主光，明暗对比分明" },
    { id: "backlight", label: "逆光", prompt: "逆光，主体边缘形成轮廓光" },
    { id: "top", label: "顶光", prompt: "正上方顶光" },
    { id: "bottom", label: "底光", prompt: "来自画面下方的底光" },
    { id: "front", label: "正面光", prompt: "正面均匀主光" },
];

/** 光色预设 */
export const LIGHTING_COLORS: CanvasLightingOption[] = [
    { id: "warm", label: "暖色", prompt: "暖色调光线" },
    { id: "cool", label: "冷色", prompt: "冷色调光线" },
    { id: "neutral", label: "中性", prompt: "中性色温光线" },
];

/** 光线强度预设 */
export const LIGHTING_INTENSITIES: CanvasLightingOption[] = [
    { id: "soft", label: "柔和", prompt: "光线柔和，过渡自然" },
    { id: "medium", label: "中等", prompt: "光线强度适中" },
    { id: "strong", label: "强烈", prompt: "光线强烈，明暗对比显著" },
];

/** 打光调节参数（均为可空的档位值） */
export type CanvasLightingSettings = {
    direction?: string;
    color?: string;
    intensity?: string;
};

function lightingOptionPrompt(options: CanvasLightingOption[], id?: string) {
    if (!id) return "";
    return options.find((option) => option.id === id)?.prompt || "";
}

/** 把打光调节参数转写成编辑提示词；全部未选时返回空串 */
export function buildLightingPrompt(settings?: CanvasLightingSettings | null, basePrompt?: string) {
    if (!settings) return "";
    const parts = [lightingOptionPrompt(LIGHTING_DIRECTIONS, settings.direction), lightingOptionPrompt(LIGHTING_COLORS, settings.color), lightingOptionPrompt(LIGHTING_INTENSITIES, settings.intensity)].filter(Boolean);
    if (!parts.length) return "";
    const preset = `以参考图为基础重新打光：${parts.join("，")}。保持画面内容、构图和画风不变，只调整光影与色温，阴影和高光的位置符合新的光照方向，整体自然真实。`;
    return withBasePrompt(preset, basePrompt);
}
