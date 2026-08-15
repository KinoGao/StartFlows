import { CanvasNodeType } from "../types";

/** Agent Run：一次规划 → 计划编译为画布 ops → 按依赖拓扑执行 → 节点状态回填（对齐 VOZEB Agent Run 模型）。 */

export type AgentRunDeliverableType = "text" | "image" | "video" | "audio";

export type AgentRunDeliverable = {
    id: string;
    title: string;
    type: AgentRunDeliverableType;
    prompt: string;
    /** 图片产物数量（其余类型固定 1） */
    count?: number;
    /** 修改已有画布节点时的目标节点 id（原位编辑） */
    targetNodeId?: string;
    /** 依赖的其他 deliverable id（上游完成后才执行） */
    dependencies: string[];
};

export type AgentRunFoundation = {
    brief: { objective: string; audience: string; coreMessage: string; constraints: string[] };
    direction: { summary: string; style: string; composition: string; colors: string[]; lighting: string; keywords: string[]; avoid: string[] };
};

export type AgentRunPlan = {
    intent: "conversation" | "generation";
    reply: string;
    foundation?: AgentRunFoundation;
    deliverables: AgentRunDeliverable[];
};

export type AgentRunTaskStatus = "ready" | "running" | "completed" | "failed" | "cancelled";

export type AgentRunTask = {
    /** 对应 deliverable id */
    id: string;
    title: string;
    type: AgentRunDeliverableType;
    /** 画布上的任务节点 id */
    nodeId: string;
    status: AgentRunTaskStatus;
    attempts: number;
    error?: string;
};

export type AgentRunStatus = "planning" | "planned" | "running" | "paused" | "completed" | "failed" | "cancelled";

export type AgentRun = {
    id: string;
    projectId: string;
    title: string;
    requirement: string;
    status: AgentRunStatus;
    plan?: AgentRunPlan;
    tasks: AgentRunTask[];
    createdAt: number;
    updatedAt: number;
};

export const AGENT_RUN_NODE_TYPE_MAP: Record<AgentRunDeliverableType, CanvasNodeType> = {
    text: CanvasNodeType.Text,
    image: CanvasNodeType.Image,
    video: CanvasNodeType.Video,
    audio: CanvasNodeType.Audio,
};
