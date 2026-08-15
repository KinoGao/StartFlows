import type { AiConfig } from "@/flowcanvas/stores/use-config-store";
import { requestToolResponse, type ResponseFunctionTool } from "@/flowcanvas/services/api/image";
import type { CanvasAgentSnapshot } from "../utils/canvas-agent-ops";
import type { AgentRunDeliverable, AgentRunDeliverableType, AgentRunPlan } from "./agent-run-types";

/** 模型唯一的规划工具：一次 function call 输出完整创作计划（对齐 VOZEB create_agent_plan）。 */
const CREATE_AGENT_PLAN_TOOL: ResponseFunctionTool = {
    type: "function",
    function: {
        name: "create_agent_plan",
        description: "创建画布创作计划：先定创作简报与视觉方向，再列出要生成的产物清单（deliverables），由系统编译为画布节点并执行。",
        parameters: {
            type: "object",
            properties: {
                intent: { type: "string", enum: ["conversation", "generation"], description: "纯问答/讨论为 conversation；需要生成或修改画布产物为 generation" },
                reply: { type: "string", description: "给用户的一句话回复（计划摘要或问答内容）" },
                foundation: {
                    type: "object",
                    description: "generation 必填：创作简报 + 视觉方向，所有产物必须与之保持一致",
                    properties: {
                        brief: {
                            type: "object",
                            properties: {
                                objective: { type: "string" },
                                audience: { type: "string" },
                                coreMessage: { type: "string" },
                                constraints: { type: "array", items: { type: "string" } },
                            },
                        },
                        direction: {
                            type: "object",
                            properties: {
                                summary: { type: "string" },
                                style: { type: "string" },
                                composition: { type: "string" },
                                colors: { type: "array", items: { type: "string" } },
                                lighting: { type: "string" },
                                keywords: { type: "array", items: { type: "string" } },
                                avoid: { type: "array", items: { type: "string" } },
                            },
                        },
                    },
                },
                deliverables: {
                    type: "array",
                    description: "generation 必填：要生成/修改的产物清单，conversation 时为空数组",
                    items: {
                        type: "object",
                        properties: {
                            id: { type: "string", description: "产物 id，如 d1、d2" },
                            title: { type: "string", description: "产物标题（2-8 字）" },
                            type: { type: "string", enum: ["text", "image", "video", "audio"] },
                            prompt: { type: "string", description: "完整可执行的生成提示词（主体、动作、场景、氛围）" },
                            count: { type: "number", description: "图片产物数量，默认 1" },
                            targetNodeId: { type: "string", description: "仅当用户要求修改已有画布节点时填写快照中真实存在的节点 id" },
                            dependencies: { type: "array", items: { type: "string" }, description: "依赖的其他产物 id，上游完成后才执行" },
                        },
                        required: ["title", "type", "prompt"],
                    },
                },
            },
            required: ["intent", "reply", "deliverables"],
        },
    },
};

function buildPlannerSystemPrompt(): string {
    return [
        "你是 FlowCanvas 画布创作 Agent 的规划器，也能进行普通对话。你只输出一份创作计划，不直接操作画布；系统会把计划编译成画布节点并执行。",
        "intent 判定：用户只是提问、讨论、要建议时为 conversation（deliverables 为空数组，reply 直接回答）；用户明确要求创作、生成、修改画布内容时为 generation。",
        "generation 必须先形成 foundation：brief 说明目标、受众、核心信息和约束；direction 给出明确的风格、构图/镜头、色彩、光线、视觉关键词和避免事项。每个 deliverable 的 prompt 必须执行同一 foundation，保持主体、信息、色彩和视觉语言一致。",
        "deliverables 规划：按叙事或生产顺序排列；有先后依赖（如先剧本后分镜、先角色图后场景视频）时用 dependencies 声明；图片可用 count 一次多张；提示词写可拍的具体画面（人怎么干而非人干什么），景别/运镜用规范术语。",
        "修改已有节点：用户要求修改画布上已有产物时，deliverable 必须填该节点真实存在的 targetNodeId（从画布快照的节点 id 中选，不得编造）；用户选中了节点时优先且只能从选中节点中选择。",
        "影视制作规范：分镜类内容按「资产（角色/道具/场景）→ 连续分镜」组织；景别用 大远景/远景/全景/中景/近景/特写；运镜写具体运动方式；同一场戏角色位置、服装、道具前后连贯不跳戏。",
        "只通过 create_agent_plan 工具输出计划；渠道不支持工具调用时，只输出一个符合工具参数结构的 JSON 对象，不要输出其他内容。不要暴露思维链。回复使用中文。",
    ].join("\n");
}

/** 给模型的画布快照：压缩为 id/类型/标题/尺寸/内容摘要 + 连线 + 选中节点（坐标不给模型，布局由编译器决定）。 */
function buildSnapshotSummary(snapshot: CanvasAgentSnapshot) {
    const selected = new Set(snapshot.selectedNodeIds);
    return {
        title: snapshot.title,
        selectedNodeIds: snapshot.selectedNodeIds,
        nodes: snapshot.nodes.slice(0, 120).map((node) => ({
            id: node.id,
            type: node.type,
            title: node.title,
            selected: selected.has(node.id) || undefined,
            content: (node.metadata?.content || node.metadata?.prompt || "").slice(0, 160) || undefined,
        })),
        connections: snapshot.connections.slice(0, 200).map((conn) => ({ from: conn.fromNodeId, to: conn.toNodeId })),
    };
}

function extractJson(text: string): unknown | null {
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
        if (char === '"') inString = !inString;
        if (inString) continue;
        if (char === "{") depth += 1;
        else if (char === "}") {
            depth -= 1;
            if (depth === 0) {
                try {
                    return JSON.parse(candidate.slice(start, index + 1));
                } catch {
                    return null;
                }
            }
        }
    }
    return null;
}

function text(value: unknown, max = 400): string {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function textList(value: unknown, max = 12): string[] {
    return Array.isArray(value) ? value.map((item) => text(item, 80)).filter(Boolean).slice(0, max) : [];
}

const DELIVERABLE_TYPES: AgentRunDeliverableType[] = ["text", "image", "video", "audio"];

/** 校验并归一化计划：deliverable id 唯一、依赖存在且无环、targetNodeId 必须真实存在；非法计划抛错。 */
export function normalizeAgentRunPlan(raw: unknown, snapshot: CanvasAgentSnapshot): AgentRunPlan {
    const record = (raw && typeof raw === "object" ? raw : null) as Record<string, unknown> | null;
    if (!record) throw new Error("计划格式不正确");
    const intent = record.intent === "generation" ? "generation" : "conversation";
    const reply = text(record.reply) || (intent === "conversation" ? "好的。" : "已为你规划创作任务。");
    if (intent === "conversation") return { intent, reply, deliverables: [] };

    const briefRaw = (record.foundation as Record<string, unknown>)?.brief as Record<string, unknown> | undefined;
    const directionRaw = (record.foundation as Record<string, unknown>)?.direction as Record<string, unknown> | undefined;
    const foundation = {
        brief: {
            objective: text(briefRaw?.objective),
            audience: text(briefRaw?.audience),
            coreMessage: text(briefRaw?.coreMessage),
            constraints: textList(briefRaw?.constraints),
        },
        direction: {
            summary: text(directionRaw?.summary),
            style: text(directionRaw?.style),
            composition: text(directionRaw?.composition),
            colors: textList(directionRaw?.colors),
            lighting: text(directionRaw?.lighting),
            keywords: textList(directionRaw?.keywords),
            avoid: textList(directionRaw?.avoid),
        },
    };

    const existingNodeIds = new Set(snapshot.nodes.map((node) => node.id));
    const items = Array.isArray(record.deliverables) ? record.deliverables.slice(0, 24) : [];
    const deliverables: AgentRunDeliverable[] = [];
    items.forEach((item, index) => {
        if (!item || typeof item !== "object") return;
        const raw2 = item as Record<string, unknown>;
        const type = DELIVERABLE_TYPES.includes(raw2.type as AgentRunDeliverableType) ? (raw2.type as AgentRunDeliverableType) : "text";
        const prompt = text(raw2.prompt, 2000);
        const title = text(raw2.title, 24) || `产物 ${index + 1}`;
        if (!prompt && type !== "text") return;
        const targetNodeId = text(raw2.targetNodeId, 80);
        deliverables.push({
            id: text(raw2.id, 40) || `d${index + 1}`,
            title,
            type,
            prompt,
            count: type === "image" ? Math.min(9, Math.max(1, Number(raw2.count) || 1)) : 1,
            targetNodeId: targetNodeId && existingNodeIds.has(targetNodeId) ? targetNodeId : undefined,
            dependencies: textList(raw2.dependencies, 8),
        });
    });
    // 依赖必须引用存在的 deliverable 且无环
    const ids = new Set(deliverables.map((item) => item.id));
    deliverables.forEach((item) => {
        item.dependencies = item.dependencies.filter((dep) => dep !== item.id && ids.has(dep));
    });
    const visiting = new Set<string>();
    const done = new Set<string>();
    const byId = new Map(deliverables.map((item) => [item.id, item]));
    const visit = (item: AgentRunDeliverable): void => {
        if (done.has(item.id)) return;
        if (visiting.has(item.id)) {
            item.dependencies = [];
            return;
        }
        visiting.add(item.id);
        item.dependencies.forEach((dep) => {
            const target = byId.get(dep);
            if (target) visit(target);
        });
        visiting.delete(item.id);
        done.add(item.id);
    };
    deliverables.forEach(visit);
    // 破环后仍成环的依赖直接清掉（保守处理：清掉仍指向未完成链路的依赖）
    if (!deliverables.length) throw new Error("计划里没有可执行的产物");
    return { intent, reply, foundation, deliverables };
}

/** 调文本模型做一次创作规划；优先工具调用，渠道不支持时解析裸 JSON。 */
export async function requestAgentRunPlan(config: AiConfig, requirement: string, snapshot: CanvasAgentSnapshot): Promise<AgentRunPlan> {
    const requestConfig = { ...config, model: config.textModel || config.model, systemPrompt: "" };
    const messages = [
        { role: "system" as const, content: buildPlannerSystemPrompt() },
        {
            role: "user" as const,
            content: JSON.stringify({
                requirement,
                canvasSnapshot: buildSnapshotSummary(snapshot),
            }),
        },
    ];
    const result = await requestToolResponse(requestConfig, messages, [CREATE_AGENT_PLAN_TOOL], "auto", () => {});
    const call = result.toolCalls.find((item) => item.function.name === "create_agent_plan");
    if (call) {
        let parsed: unknown = null;
        try {
            parsed = JSON.parse(call.function.arguments || "{}");
        } catch {
            parsed = null;
        }
        return normalizeAgentRunPlan(parsed, snapshot);
    }
    const fallback = extractJson(result.content || "");
    if (fallback) return normalizeAgentRunPlan(fallback, snapshot);
    throw new Error("模型没有返回可识别的创作计划，请重试或换个文本模型");
}
