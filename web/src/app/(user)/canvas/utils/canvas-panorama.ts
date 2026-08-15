export const PANORAMA_IMAGE_SIZE = "2048x1024";
export const PANORAMA_NODE_SIZE = { width: 340, height: 170 } as const;

const PANORAMA_PROMPT_MARKER = "\n\n[全景输出约束]\n";

export function buildPanoramaPrompt(prompt: string, hasReferences: boolean) {
    const basePrompt = prompt.split(PANORAMA_PROMPT_MARKER)[0].trim();
    const referenceDirection = hasReferences ? "参考素材只用于保留主体、材质、色彩和空间线索；补全四周环境，不要拉伸原图。" : "根据文字完整构建观看者四周的连续环境。";
    return `${basePrompt}${PANORAMA_PROMPT_MARKER}${referenceDirection} 最终只输出一张 2:1 等距柱状投影全景图，水平覆盖 360 度，垂直覆盖 180 度，观看者位于场景中心。地平线保持在垂直中心附近，左右边缘自然无缝衔接，天空或天花板、地面或地板必须完整。不要普通横幅、鱼眼圆形边框、多图拼接、文字、水印、界面元素或明显接缝。`.trim();
}

export function isPanoramaRatio(width: number, height: number) {
    return width > 0 && height > 0 && Math.abs(width / height - 2) <= 0.02;
}
