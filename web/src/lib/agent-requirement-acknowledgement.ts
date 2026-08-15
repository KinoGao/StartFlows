import type { CreativeSurface } from "@/lib/creative-runtime-contract";
import { extractImageSizeFromPrompt } from "@/lib/image-size";

export function agentRequirementAcknowledgement(prompt: string, surface: CreativeSurface, hasReferences = false) {
    const normalized = prompt.trim();
    const size = extractImageSizeFromPrompt(normalized);
    const kind = /(?:视频|短片|动画|运镜|图生视频)/u.test(normalized) ? "视频" : /(?:图片|图像|海报|封面|主视觉|生图|照片)/u.test(normalized) ? "图片" : /(?:音频|配音|声音|旁白|语音)/u.test(normalized) ? "音频" : "创作需求";
    if (surface === "canvas") return hasReferences ? `收到，我会基于当前选中素材处理这次${kind}。` : `收到，我会结合当前画布处理这次${kind}。`;
    if (surface === "drama") return hasReferences ? "收到，我会结合当前短剧项目与参考素材继续创作。" : "收到，我会结合当前短剧项目继续创作。";
    if (hasReferences) return `收到，我会根据当前参考素材完成这次${kind}。`;
    if (size && kind === "图片") return `收到，我会按 ${size} 尺寸完成这次图片创作。`;
    return `收到，我会按你的要求处理这次${kind}。`;
}
