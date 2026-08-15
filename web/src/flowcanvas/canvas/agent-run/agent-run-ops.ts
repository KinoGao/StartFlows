import { getNodeSpec } from "../constants";
import type { CanvasAgentOp, CanvasAgentSnapshot } from "../utils/canvas-agent-ops";
import { AGENT_RUN_NODE_TYPE_MAP, type AgentRun, type AgentRunDeliverable, type AgentRunFoundation, type AgentRunPlan, type AgentRunTask } from "./agent-run-types";

/** 把创作简报 + 视觉方向注入产物提示词（一致性约束，对齐 VOZEB withCreativeFoundation）。 */
export function buildAgentRunPrompt(deliverable: AgentRunDeliverable, foundation?: AgentRunFoundation): string {
    const parts: string[] = [];
    if (foundation) {
        const brief = [foundation.brief.objective && `目标：${foundation.brief.objective}`, foundation.brief.audience && `受众：${foundation.brief.audience}`, foundation.brief.coreMessage && `核心信息：${foundation.brief.coreMessage}`, foundation.brief.constraints.length ? `约束：${foundation.brief.constraints.join("；")}` : ""].filter(Boolean);
        const direction = [
            foundation.direction.summary && `视觉方向：${foundation.direction.summary}`,
            foundation.direction.style && `风格：${foundation.direction.style}`,
            foundation.direction.composition && `构图/镜头：${foundation.direction.composition}`,
            foundation.direction.colors.length ? `色彩：${foundation.direction.colors.join("、")}` : "",
            foundation.direction.lighting && `光线：${foundation.direction.lighting}`,
            foundation.direction.keywords.length ? `关键词：${foundation.direction.keywords.join("、")}` : "",
            foundation.direction.avoid.length ? `避免：${foundation.direction.avoid.join("、")}` : "",
        ].filter(Boolean);
        if (brief.length) parts.push(brief.join("；"));
        if (direction.length) parts.push(direction.join("；"));
        if (deliverable.dependencies.length) parts.push("与上游产物保持主体、场景和风格一致");
    }
    parts.push(deliverable.prompt);
    return parts.join("\n");
}

function foundationText(foundation: AgentRunFoundation): { brief: string; direction: string } {
    const briefLines = [
        `目标：${foundation.brief.objective || "—"}`,
        foundation.brief.audience ? `受众：${foundation.brief.audience}` : "",
        foundation.brief.coreMessage ? `核心信息：${foundation.brief.coreMessage}` : "",
        foundation.brief.constraints.length ? `约束：${foundation.brief.constraints.join("；")}` : "",
    ].filter(Boolean);
    const directionLines = [
        foundation.direction.summary || "",
        foundation.direction.style ? `风格：${foundation.direction.style}` : "",
        foundation.direction.composition ? `构图/镜头：${foundation.direction.composition}` : "",
        foundation.direction.colors.length ? `色彩：${foundation.direction.colors.join("、")}` : "",
        foundation.direction.lighting ? `光线：${foundation.direction.lighting}` : "",
        foundation.direction.keywords.length ? `关键词：${foundation.direction.keywords.join("、")}` : "",
        foundation.direction.avoid.length ? `避免：${foundation.direction.avoid.join("、")}` : "",
    ].filter(Boolean);
    return { brief: briefLines.join("\n"), direction: directionLines.join("\n") };
}

/**
 * 计划 → 画布 ops 编译器：确定性三栏布局（简报/视觉方向 → 任务节点列），
 * 节点 id 由 runId + deliverable id 决定（幂等，重复编译同计划不产生重复节点）。
 */
export function compileAgentRunOps(run: AgentRun, plan: AgentRunPlan, snapshot: CanvasAgentSnapshot, models: { textModel: string; imageModel: string; videoModel: string; audioModel: string }): { ops: CanvasAgentOp[]; tasks: AgentRunTask[] } {
    const ops: CanvasAgentOp[] = [];
    const tasks: AgentRunTask[] = [];
    const anchorX = snapshot.nodes.length ? Math.max(...snapshot.nodes.map((node) => node.position.x + (node.width || 240))) + 120 : 0;
    const anchorY = snapshot.nodes.length ? Math.min(...snapshot.nodes.map((node) => node.position.y)) : 0;
    const textSpec = getNodeSpec(AGENT_RUN_NODE_TYPE_MAP.text);

    let briefNodeId = "";
    let directionNodeId = "";
    if (plan.foundation) {
        const text = foundationText(plan.foundation);
        briefNodeId = `agentrun-${run.id}-brief`;
        directionNodeId = `agentrun-${run.id}-direction`;
        ops.push({
            type: "add_node",
            id: briefNodeId,
            nodeType: AGENT_RUN_NODE_TYPE_MAP.text,
            title: "创作简报",
            position: { x: anchorX, y: anchorY },
            metadata: { content: text.brief, agentRunId: run.id },
        });
        ops.push({
            type: "add_node",
            id: directionNodeId,
            nodeType: AGENT_RUN_NODE_TYPE_MAP.text,
            title: "视觉方向",
            position: { x: anchorX, y: anchorY + textSpec.height + 36 },
            metadata: { content: text.direction, agentRunId: run.id },
        });
    }

    const taskColumnX = anchorX + textSpec.width + 96;
    const taskNodeIds: string[] = [];
    const nodeIdByDeliverableId = new Map<string, string>();
    plan.deliverables.forEach((deliverable) => {
        nodeIdByDeliverableId.set(deliverable.id, deliverable.targetNodeId || `agentrun-${run.id}-${deliverable.id}`);
    });
    plan.deliverables.forEach((deliverable, index) => {
        const finalPrompt = buildAgentRunPrompt(deliverable, plan.foundation);
        const nodeType = AGENT_RUN_NODE_TYPE_MAP[deliverable.type];
        const spec = getNodeSpec(nodeType);
        const model = deliverable.type === "image" ? models.imageModel : deliverable.type === "video" ? models.videoModel : deliverable.type === "audio" ? models.audioModel : models.textModel;
        const isInplaceEdit = Boolean(deliverable.targetNodeId);
        const nodeId = nodeIdByDeliverableId.get(deliverable.id)!;
        taskNodeIds.push(nodeId);
        tasks.push({ id: deliverable.id, title: deliverable.title, type: deliverable.type, nodeId, status: "ready", attempts: 0 });

        if (isInplaceEdit) {
            ops.push({ type: "update_node", id: nodeId, metadata: { prompt: finalPrompt, composerContent: finalPrompt, agentRunId: run.id, agentTaskId: deliverable.id } });
        } else {
            const metadata =
                deliverable.type === "image"
                    ? { generationMode: "image" as const, generationType: "generation" as const, prompt: finalPrompt, composerContent: finalPrompt, model, count: deliverable.count || 1 }
                    : deliverable.type === "video"
                      ? { generationMode: "video" as const, videoGenerationMode: "text-to-video" as const, prompt: finalPrompt, composerContent: finalPrompt, model }
                      : deliverable.type === "audio"
                        ? { generationMode: "audio" as const, prompt: finalPrompt, composerContent: finalPrompt, model }
                        : { content: "", prompt: finalPrompt, composerContent: finalPrompt, model };
            ops.push({
                type: "add_node",
                id: nodeId,
                nodeType,
                title: deliverable.title,
                position: { x: taskColumnX, y: anchorY + index * (spec.height + 36) },
                metadata: { ...metadata, agentRunId: run.id, agentTaskId: deliverable.id },
            });
        }
        if (briefNodeId) ops.push({ type: "connect_nodes", fromNodeId: briefNodeId, toNodeId: nodeId });
        if (directionNodeId) ops.push({ type: "connect_nodes", fromNodeId: directionNodeId, toNodeId: nodeId });
        deliverable.dependencies.forEach((dep) => {
            const upstreamNodeId = nodeIdByDeliverableId.get(dep);
            if (upstreamNodeId && upstreamNodeId !== nodeId) ops.push({ type: "connect_nodes", fromNodeId: upstreamNodeId, toNodeId: nodeId });
        });
    });
    ops.push({ type: "select_nodes", ids: taskNodeIds });
    return { ops, tasks };
}
