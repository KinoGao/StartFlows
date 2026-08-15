import type { CreativeAsset, CreativeProjectHandoff, CreativeProjectHandoffPlan, CreativeSurface } from "@/lib/creative-runtime-contract";
import type { AgentRun } from "@/lib/server/agent-run-store";
import type { AgentPlan } from "@/lib/server/agent-run-validation";
import { getCreativeAssetsByIds } from "@/lib/server/creative-runtime-store";

export function normalizeAgentProjectHandoff(plan: AgentPlan, surface: CreativeSurface, referencedAssets: CreativeAsset[], prompt: string): CreativeProjectHandoffPlan | undefined {
    const handoff = plan.projectHandoff;
    if (!handoff) return undefined;
    if (surface !== "chat" || !isExplicitProjectHandoffRequest(prompt)) return undefined;
    const available = new Set(referencedAssets.map((asset) => asset.id));
    const assetIds = Array.from(new Set((handoff.assetIds || []).map((id) => id.trim()).filter(Boolean)));
    if (assetIds.some((id) => !available.has(id))) throw new Error("项目交接引用了不存在的资产");
    const plannedRatio = handoff.ratio || plan.deliverables.map((item) => item.ratio).find((ratio) => ratio === "9:16" || ratio === "16:9");
    return {
        surface: handoff.surface,
        title: handoff.title.trim().slice(0, 120),
        summary: handoff.summary?.trim().slice(0, 1200) || plan.foundation.brief.objective || plan.objective,
        style: handoff.style?.trim().slice(0, 200) || plan.foundation.direction.summary,
        ratio: plannedRatio === "9:16" || plannedRatio === "16:9" ? plannedRatio : handoff.surface === "drama" ? "9:16" : "16:9",
        assetIds,
    };
}

export async function buildAgentProjectHandoff(run: AgentRun): Promise<CreativeProjectHandoff | undefined> {
    if (!run.projectHandoff || !isExplicitProjectHandoffRequest(run.prompt)) return undefined;
    const assetIds = Array.from(new Set([...(run.projectHandoff.assetIds || []), ...run.assetIds]));
    const assets = (await getCreativeAssetsByIds(assetIds, run.userId)).filter((asset) => asset.conversationId === run.conversationId && asset.status === "ready");
    return {
        id: `handoff-${run.id}`,
        sourceRunId: run.id,
        conversationId: run.conversationId,
        surface: run.projectHandoff.surface,
        title: run.projectHandoff.title,
        summary: run.projectHandoff.summary || run.foundation?.brief.objective || run.prompt,
        style: run.projectHandoff.style,
        ratio: run.projectHandoff.ratio,
        assetIds: assets.map((asset) => asset.id),
        assets,
    };
}

export function isExplicitProjectHandoffRequest(prompt: string) {
    const text = prompt.trim();
    if (!text) return false;
    const target = /(?:项目|画布|canvas|短剧项目|剧集项目|drama)/i;
    const action = /(?:创建|建立|新建|搭建|整理成|做成|转成|转为|加入到|放到|导入到)/i;
    return target.test(text) && action.test(text);
}
