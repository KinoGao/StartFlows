/**
 * 图片节点「/」快捷功能（对齐 LibTV）：以当前图为参考图，
 * 通过提示词预设 + 图生图编辑管线生成新画面。
 */

export type CanvasImageQuickCommandId = "lens-focus" | "focus-edit" | "cinematic-lighting" | "character-turnaround" | "extrapolate-forward" | "extrapolate-backward";

export type CanvasImageQuickCommand = {
    id: CanvasImageQuickCommandId;
    label: string;
    description: string;
};

export const CANVAS_IMAGE_QUICK_COMMANDS: CanvasImageQuickCommand[] = [
    { id: "lens-focus", label: "镜头聚焦", description: "聚焦核心主体生成特写镜头" },
    { id: "focus-edit", label: "焦点编辑", description: "提取关键元素重新组合成新图" },
    { id: "cinematic-lighting", label: "电影级光影矫正", description: "优化光影层次与电影感调色" },
    { id: "character-turnaround", label: "角色三视图", description: "正面 / 侧面 / 背面角色设定图" },
    { id: "extrapolate-forward", label: "推演 3 秒后", description: "推演画面 3 秒后的变化" },
    { id: "extrapolate-backward", label: "推演 5 秒前", description: "回溯画面 5 秒前的样子" },
];

const IMAGE_QUICK_COMMAND_PROMPTS: Record<CanvasImageQuickCommandId, string> = {
    "lens-focus":
        "以参考图为基础，聚焦画面中的核心主体或关键细节，生成一张特写镜头画面。主体清晰突出，浅景深虚化背景，保持参考图的人物特征、服装、场景氛围和画风一致，电影感特写构图。",
    "focus-edit":
        "以参考图为基础，提取画面中的关键元素（主体、道具、场景特征），重新组合排布生成一张新画面。保持各元素的外观、配色和画风与参考图一致，重新设计构图，画面自然协调。",
    "cinematic-lighting":
        "以参考图为基础进行电影级光影矫正：优化曝光与对比度，强化主光、补光与轮廓光的层次，统一色温并做电影感调色。保持画面内容与构图不变，输出光影氛围更专业的版本。",
    "character-turnaround":
        "以参考图中的角色为主体，生成一张角色三视图设定图：同一角色的正面、侧面、背面并排排列在同一张图中。保持角色的五官、发型、服装、配色和体型完全一致，全身等比例展示，纯色简洁背景，角色设定图（character sheet）风格。",
    "extrapolate-forward":
        "以参考图为当前时刻的画面，推演并生成 3 秒后同一画面可能发生的变化：人物动作、表情、光影或事件自然推进，保持人物、场景和画风一致，像同一连续镜头中 3 秒后的那一帧。",
    "extrapolate-backward":
        "以参考图为当前时刻的画面，回溯并推演 5 秒前同一画面可能的样子：还原人物动作、表情、光影或事件的前置状态，保持人物、场景和画风一致，像同一连续镜头中 5 秒前的那一帧。",
};

/** 构造快捷功能的编辑提示词；原图提示词作为补充上下文帮助模型保持一致性 */
export function buildImageQuickCommandPrompt(commandId: CanvasImageQuickCommandId, basePrompt?: string) {
    const preset = IMAGE_QUICK_COMMAND_PROMPTS[commandId];
    const base = basePrompt?.trim();
    return base ? `${preset}\n原画面描述：${base}` : preset;
}
