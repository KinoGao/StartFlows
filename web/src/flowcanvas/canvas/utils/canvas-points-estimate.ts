/** 画布生成积分预估：复用公开 session 的 modelPointCosts 与参数倍率，与短剧 estimateTaskPoints 同口径。 */

export type CanvasSessionPricing = {
    modelPointCosts: Record<string, number>;
    generationPointMultipliers: {
        imageQuality: Record<string, number>;
        videoQuality: Record<string, number>;
        videoSeconds: Record<string, number>;
    };
};

/** 模型基础积分按逻辑模型 ID 查询，兼容 "channel::model" 选项格式与上游模型名。查不到返回 null（区别于 0 积分的免费模型）。 */
export function lookupModelBasePoints(costs: Record<string, number>, model: string): number | null {
    const trimmed = model.trim();
    if (!trimmed) return null;
    if (costs[trimmed] != null) return Number(costs[trimmed]);
    const name = trimmed.includes("::") ? trimmed.split("::").pop()!.trim() : trimmed;
    if (costs[name] != null) return Number(costs[name]);
    return null;
}

export function estimateCanvasTaskPoints(pricing: CanvasSessionPricing, params: { type: "image" | "video"; model: string; quality?: string; seconds?: number }): number | null {
    const base = lookupModelBasePoints(pricing.modelPointCosts, params.model);
    if (base == null) return null;
    if (params.type === "image") {
        const quality = params.quality ? (pricing.generationPointMultipliers.imageQuality[params.quality] ?? 1) : 1;
        return Number((base * quality).toFixed(2));
    }
    const quality = params.quality ? (pricing.generationPointMultipliers.videoQuality[params.quality] ?? 1) : 1;
    const seconds = params.seconds != null ? (pricing.generationPointMultipliers.videoSeconds[String(params.seconds)] ?? 1) : 1;
    return Number((base * quality * seconds).toFixed(2));
}
