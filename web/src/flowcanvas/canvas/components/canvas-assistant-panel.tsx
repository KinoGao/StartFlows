"use client";

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import copyToClipboard from "copy-to-clipboard";
import { Bot, ChevronDown, Clapperboard, Copy, Cpu, History, PanelRightClose, Settings2, ShieldCheck, Sparkles, Trash2, Undo2, Video, WandSparkles, X } from "lucide-react";
import { Button, Modal, Segmented, Select, Tooltip } from "antd";
import { motion, useReducedMotion } from "motion/react";

import { modelOptionName, normalizeModelOptionValue, resolveModelChannel, selectableModelsByCapability, useConfigStore, useEffectiveConfig, type AiConfig } from "@/flowcanvas/stores/use-config-store";
import { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { nanoid } from "nanoid";
import { requestToolResponse, type ResponseFunctionTool, type ResponseInputMessage, type ResponseToolCall } from "@/flowcanvas/services/api/image";
import { imageToDataUrl } from "@/flowcanvas/services/image-storage";
import { getMediaBlob } from "@/flowcanvas/services/file-storage";
import { useAssetStore } from "@/flowcanvas/stores/use-asset-store";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";
import { useUserStore } from "@/flowcanvas/stores/use-user-store";
import { imageReferenceLabel } from "@/flowcanvas/lib/image-reference-prompt";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { AgentChatComposer, AgentChatMessage, AgentWorkingMessage, type CanvasAgentChatMessage, type CanvasAgentMode } from "./canvas-agent-chat-ui";
import { AgentRunCard } from "../agent-run/agent-run-card";
import { buildVozebCanvasSnapshot, mapVozebAgentRun, mapVozebCanvasOps, watchVozebAgentRun } from "../agent-run/agent-run-vozeb";
import type { AgentRun } from "../agent-run/agent-run-types";
import { controlCreativeAgentRun, createCreativeAgentRun, listCreativeAgentRuns, retryCreativeAgentTask } from "@/services/api/creative";
import { CanvasLocalAgentPanel } from "./canvas-local-agent-panel";
import { NODE_DEFAULT_SIZE } from "../constants";
import { CanvasNodeType, type CanvasAssistantMessage, type CanvasAssistantReference, type CanvasAssistantSession, type CanvasNodeData } from "../types";
import { useCanvasAgentStore } from "../stores/use-canvas-agent-store";
import { summarizeCanvasAgentOps, CANVAS_AGENT_SIDE_EFFECT_OP_TYPES, type CanvasAgentOp, type CanvasAgentSnapshot } from "../utils/canvas-agent-ops";
import { buildCanvasResourceReferences } from "../utils/canvas-resource-references";
import { ART_SKILL_OPTIONS, DIRECTOR_SKILL_OPTIONS, STORY_SKILL_OPTIONS } from "../agent-skills/options";
import { loadArtSkill, loadDirectorSkill, loadStorySkill } from "../agent-skills/loader";
import type { CanvasWorkflowTemplate } from "../utils/canvas-workflow-template";

export const CANVAS_AGENT_PANEL_MOTION_MS = 240;
const PANEL_MOTION_SECONDS = CANVAS_AGENT_PANEL_MOTION_MS / 1000;
const ONLINE_AGENT_MAX_STEPS = 8;
const ONLINE_AGENT_PROMPT = [
    "你是 Infinite Canvas 网页内置在线画布助手，可以直接操作当前画布。当前画布 JSON 会随用户消息提供（含每个节点的生成参数）。",
    "首轮必须调用工具：只读问题用 canvas_get_state / canvas_get_selection；改动画布时调用对应工具。",
    "能力域：",
    "- 创建：canvas_create_node / canvas_create_text_node(s) / canvas_create_image_prompt_flow / canvas_create_generation_flow；生成剧本/脚本/分镜时用 canvas_create_node 创建 canvasTool=\"script\" 的脚本节点（metadata.scriptBody 填剧本正文，支持分镜表与 AI 拆解），不要用普通文本节点代替；",
    "- 生成与重跑：canvas_generate_text/image/video/audio（新建流程并立即生成）、canvas_run_generation（按给定提示词跑已有节点）、canvas_retry_node（沿用上次参数重跑）、canvas_execute_group（整组拓扑重跑）；",
    "- 修改：canvas_update_node（含 model/size/count/quality/seconds 等 metadata 参数）、canvas_update_node_text、canvas_move_nodes、canvas_resize_node、canvas_delete_nodes、canvas_connect_nodes、canvas_select_nodes、canvas_set_viewport、canvas_apply_ops（精确批量）；",
    "- 图像工具：canvas_image_edit（多角度/扩图/打光/抠图/720 全景）、canvas_image_quick_command（镜头聚焦/焦点编辑/电影级光影/角色三视图/画面推演）、canvas_image_process（本地裁剪/宫格切分/高清放大，不耗模型）；",
    "- 视频工具：canvas_video_analyze（拆分镜表）、canvas_video_trim（剪辑出入点）、canvas_video_compose（拼接合成）；",
    "- 组织与复用：canvas_group_nodes / canvas_ungroup_nodes、canvas_save_template / canvas_insert_template / canvas_list_templates、canvas_grid_storyboard（脚本节点拆宫格分镜）。",
    "影视制作规范（涉及脚本/分镜/图片/视频生成时必须遵守）：",
    "- 剧本与分镜：生成分镜时按「资产（角色/道具/场景）→ 连续分镜」组织；画面描述写可拍的具体画面（\"人怎么干\"而非\"人干什么\"），景别用 大远景/远景/全景/中景/近景/特写，运镜写具体运动方式（推近/拉远/横移/跟拍/环绕/升降/固定），情绪高点用近景/特写；同一场戏角色位置、服装、道具与场景细节前后连贯，不跳戏；",
    "- 图片/视频提示词：提示词是格式转换不是创意写作，画面主体、动作、空间关系必须完整保留，不添加分镜未提及的装饰性元素；风格词、画质词是辅助修饰，服务于画面内容，冲突时以画面内容为准；",
    "- 镜头一致性：有参考图或已生成节点时，角色/场景外观必须沿用既有设定，不得自行换装、改场景。",
    "规则：不要输出 JSON ops，不要编造执行结果；工具参数涉及已有节点时必须使用当前画布 JSON 中真实存在的 id；缺少必要 id 或用户意图不明确时直接说明需要用户明确选择，不要猜测；高成本操作（批量生成、整组执行、合成导出）前先简要说明将要执行的动作；工具返回结果后，再根据真实结果回答用户。",
].join("\n");
const JSON_RECORD_SCHEMA = { type: "object", additionalProperties: true };

/** Agent 对话空态建议卡片：点击把文案填入输入 Composer（对齐 TapNow 建议卡片交互）。 */
const SUGGESTION_CARDS = [
    {
        icon: Sparkles,
        title: "头脑风暴",
        description: "打开故事方向，提出适合影像化的多种可能性",
        prompt: "帮我头脑风暴一个适合做成短视频的故事方向，给出 3 个具体点子",
    },
    {
        icon: Clapperboard,
        title: "分镜推演",
        description: "把想法拆成镜头脚本，规划画面与节奏",
        prompt: "帮我写一个 30 秒短视频的镜头脚本，包含分镜与画面描述",
    },
    {
        icon: WandSparkles,
        title: "画面优化",
        description: "分析选中节点的画面与参数，给出优化建议",
        prompt: "分析当前画布上选中的节点，给出画面与参数优化建议",
    },
];const POSITION_SCHEMA = { type: "object", properties: { x: { type: "number" }, y: { type: "number" } }, required: ["x", "y"], additionalProperties: false };
const VIEWPORT_SCHEMA = { type: "object", properties: { x: { type: "number" }, y: { type: "number" }, k: { type: "number" } }, required: ["x", "y", "k"], additionalProperties: false };
const NODE_TYPE_SCHEMA = { type: "string", enum: ["image", "text", "comfyui", "video", "audio"] };
const GENERATION_MODE_SCHEMA = { type: "string", enum: ["text", "image", "video", "audio"] };
const GENERATION_OPTION_PROPERTIES = {
    model: { type: "string" },
    size: { type: "string" },
    quality: { type: "string" },
    count: { type: "number" },
    seconds: { type: "string" },
    vquality: { type: "string" },
    generateAudio: { type: "string" },
    watermark: { type: "string" },
    audioVoice: { type: "string" },
    audioFormat: { type: "string" },
    audioSpeed: { type: "string" },
    audioInstructions: { type: "string" },
};
const CANVAS_OP_SCHEMA = {
    type: "object",
    properties: {
        type: { type: "string", enum: ["add_node", "update_node", "delete_node", "delete_connections", "connect_nodes", "set_viewport", "select_nodes", "run_generation"] },
        id: { type: "string" },
        ids: { type: "array", items: { type: "string" } },
        nodeType: NODE_TYPE_SCHEMA,
        title: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        position: POSITION_SCHEMA,
        metadata: JSON_RECORD_SCHEMA,
        patch: JSON_RECORD_SCHEMA,
        all: { type: "boolean" },
        fromNodeId: { type: "string" },
        toNodeId: { type: "string" },
        viewport: VIEWPORT_SCHEMA,
        nodeId: { type: "string" },
        mode: GENERATION_MODE_SCHEMA,
        prompt: { type: "string" },
    },
    required: ["type"],
    additionalProperties: false,
};
const ONLINE_READ_TOOLS = new Set(["canvas_get_state", "canvas_get_selection", "canvas_export_snapshot", "canvas_list_templates"]);
const HIGH_COST_ONLINE_TOOL_NAMES = new Set([
    "canvas_apply_ops",
    "canvas_generate_text",
    "canvas_generate_image",
    "canvas_generate_video",
    "canvas_generate_audio",
    "canvas_run_generation",
    "canvas_retry_node",
    "canvas_execute_group",
    "canvas_image_edit",
    "canvas_image_quick_command",
    "canvas_grid_storyboard",
    "canvas_video_analyze",
    "canvas_video_compose",
]);

function toolDefinition(name: string, description: string, properties: Record<string, unknown>, required: string[] = [], strict = false): ResponseFunctionTool {
    return { type: "function", function: { name, description, parameters: { type: "object", properties, required, additionalProperties: false }, strict } };
}

function generationToolDefinition(name: string, description: string, mode?: "text" | "image" | "video" | "audio") {
    return toolDefinition(
        name,
        description,
        {
            prompt: { type: "string" },
            title: { type: "string" },
            x: { type: "number" },
            y: { type: "number" },
            referenceNodeIds: { type: "array", items: { type: "string" } },
            ...(mode ? {} : { mode: GENERATION_MODE_SCHEMA }),
            autoRun: { type: "boolean" },
            ...GENERATION_OPTION_PROPERTIES,
        },
        ["prompt"],
    );
}

const ONLINE_AGENT_TOOLS: ResponseFunctionTool[] = [
    toolDefinition("canvas_get_state", "读取当前网页画布的节点、连线、选区和视口。", {}),
    toolDefinition("canvas_get_selection", "读取当前网页画布选中的节点。", {}),
    toolDefinition("canvas_export_snapshot", "导出当前画布快照，用于理解布局。", {}),
    toolDefinition(
        "canvas_apply_ops",
        "批量操作当前网页画布。ops 支持 add_node、update_node、delete_node、delete_connections、connect_nodes、set_viewport、select_nodes、run_generation、retry_node、execute_group、group_nodes、ungroup_nodes、image_edit、image_quick_command、image_process、grid_storyboard、video_analyze、video_trim、video_compose、save_template、insert_template。",
        { ops: { type: "array", items: CANVAS_OP_SCHEMA } },
        ["ops"],
        false,
    ),
    toolDefinition(
        "canvas_create_node",
        "创建任意类型节点：text、image、video、audio、comfyui。适合创建占位内容、媒体占位、ComfyUI 工作流节点或自定义 metadata 节点。创建脚本节点：nodeType=text、metadata.canvasTool=\"script\"、metadata.scriptBody=剧本正文。",
        { nodeType: NODE_TYPE_SCHEMA, title: { type: "string" }, x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" }, metadata: JSON_RECORD_SCHEMA },
        ["nodeType"],
    ),
    toolDefinition("canvas_create_text_node", "在当前画布创建单个文本节点。", { text: { type: "string" }, x: { type: "number" }, y: { type: "number" }, title: { type: "string" }, width: { type: "number" }, height: { type: "number" } }),
    toolDefinition(
        "canvas_create_text_nodes",
        "批量创建普通文本节点，适合生成标题、段落、说明等内容块；剧本/脚本请用 canvas_create_node 创建脚本节点。",
        {
            items: {
                type: "array",
                minItems: 1,
                items: {
                    type: "object",
                    properties: { text: { type: "string" }, title: { type: "string" }, x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } },
                    required: ["text"],
                    additionalProperties: false,
                },
            },
            x: { type: "number" },
            y: { type: "number" },
            gap: { type: "number" },
            direction: { type: "string", enum: ["row", "column"] },
        },
        ["items"],
    ),
    toolDefinition(
        "canvas_create_image_prompt_flow",
        "创建提示词文本节点和图片生成节点，并自动连线，可选择立即触发生图。",
        { prompt: { type: "string" }, x: { type: "number" }, y: { type: "number" }, autoRun: { type: "boolean" }, ...GENERATION_OPTION_PROPERTIES },
        ["prompt"],
    ),
    generationToolDefinition("canvas_create_generation_flow", "创建通用生成流程：提示词文本节点、目标生成节点、参考节点连线，可用于文案、生图、视频或音频。"),
    generationToolDefinition("canvas_generate_text", "创建通用文本生成流程并立即触发生成。", "text"),
    generationToolDefinition("canvas_generate_image", "创建通用图片生成流程并立即触发生成。", "image"),
    generationToolDefinition("canvas_generate_video", "创建通用视频生成流程并立即触发生成。", "video"),
    generationToolDefinition("canvas_generate_audio", "创建通用音频生成流程并立即触发生成。", "audio"),
    toolDefinition("canvas_update_node", "更新节点基础字段或 metadata。", { id: { type: "string" }, patch: JSON_RECORD_SCHEMA, metadata: JSON_RECORD_SCHEMA }, ["id"]),
    toolDefinition("canvas_update_node_text", "更新文本节点内容和标题。", { id: { type: "string" }, text: { type: "string" }, title: { type: "string" } }, ["id", "text"]),
    toolDefinition(
        "canvas_move_nodes",
        "移动一个或多个节点，支持绝对坐标或 dx/dy 偏移。",
        {
            items: {
                type: "array",
                minItems: 1,
                items: { type: "object", properties: { id: { type: "string" }, x: { type: "number" }, y: { type: "number" }, dx: { type: "number" }, dy: { type: "number" } }, required: ["id"], additionalProperties: false },
            },
        },
        ["items"],
    ),
    toolDefinition("canvas_resize_node", "调整节点尺寸。", { id: { type: "string" }, width: { type: "number" }, height: { type: "number" }, freeResize: { type: "boolean" } }, ["id", "width", "height"]),
    toolDefinition("canvas_delete_nodes", "删除指定节点及相关连线。", { ids: { type: "array", items: { type: "string" }, minItems: 1 } }, ["ids"]),
    toolDefinition(
        "canvas_connect_nodes",
        "批量连接节点。",
        { connections: { type: "array", minItems: 1, items: { type: "object", properties: { fromNodeId: { type: "string" }, toNodeId: { type: "string" } }, required: ["fromNodeId", "toNodeId"], additionalProperties: false } } },
        ["connections"],
    ),
    toolDefinition("canvas_select_nodes", "设置当前选中节点。", { ids: { type: "array", items: { type: "string" } } }, ["ids"]),
    toolDefinition("canvas_set_viewport", "调整画布视口。", { viewport: VIEWPORT_SCHEMA }, ["viewport"]),
    toolDefinition("canvas_run_generation", "触发指定节点生成，通常用于配置节点或文本/图片/视频/音频节点。", { nodeId: { type: "string" }, mode: GENERATION_MODE_SCHEMA, prompt: { type: "string" } }, ["nodeId"]),
    toolDefinition("canvas_list_templates", "列出账号下的工作流模板（id、名称、节点数、连线数）。", {}),
    toolDefinition("canvas_retry_node", "沿用上次参数重跑指定生成节点（重试 / 重新生成）。", { id: { type: "string" } }, ["id"]),
    toolDefinition("canvas_execute_group", "整组执行：传入组内任意节点 id，按连线拓扑序重跑其所在打组或连通分组的全部生成节点。", { id: { type: "string" } }, ["id"]),
    toolDefinition(
        "canvas_group_nodes",
        "把指定节点打组；variant 为 storyboard 时合并为分镜组。",
        { ids: { type: "array", items: { type: "string" }, minItems: 2 }, variant: { type: "string", enum: ["normal", "storyboard"] } },
        ["ids"],
    ),
    toolDefinition("canvas_ungroup_nodes", "解散指定分组节点。", { ids: { type: "array", items: { type: "string" }, minItems: 1 } }, ["ids"]),
    toolDefinition(
        "canvas_image_edit",
        "以图片节点当前图为参考做 AI 图像编辑，生成新子节点并自动连线。action：angle 多角度（params 可带 horizontalAngle/pitchAngle/cameraDistance/wideAngle）、outpaint 扩图（params.ratioId 如 16:9、9:16、4:3）、lighting 打光（params.direction/color/intensity）、cutout 抠图、panorama720 720° 全景。",
        { id: { type: "string" }, action: { type: "string", enum: ["angle", "outpaint", "lighting", "cutout", "panorama720"] }, params: JSON_RECORD_SCHEMA },
        ["id", "action"],
    ),
    toolDefinition(
        "canvas_image_quick_command",
        "对图片节点执行快捷功能，生成新子节点。commandId：lens-focus 镜头聚焦、focus-edit 焦点编辑、cinematic-lighting 电影级光影矫正、character-turnaround 角色三视图、extrapolate-forward 画面推演 3 秒后、extrapolate-backward 画面推演 5 秒前。",
        { id: { type: "string" }, commandId: { type: "string", enum: ["lens-focus", "focus-edit", "cinematic-lighting", "character-turnaround", "extrapolate-forward", "extrapolate-backward"] } },
        ["id", "commandId"],
    ),
    toolDefinition(
        "canvas_image_process",
        "本地图像处理（不调用模型）：crop 裁剪（params: {x, y, width, height}，像素）、split 宫格切分（params: {rows, columns}）、upscale 高清放大（params.targetLongEdge 取 1024/2048/4096）。",
        { id: { type: "string" }, action: { type: "string", enum: ["crop", "split", "upscale"] }, params: JSON_RECORD_SCHEMA },
        ["id", "action"],
    ),
    toolDefinition(
        "canvas_grid_storyboard",
        "把脚本节点拆成宫格连贯分镜：four-grid 2×2、nine-grid 3×3、twentyfive-grid 5×5，生成分镜节点并自动连线、立即调用模型生成。",
        { id: { type: "string" }, commandId: { type: "string", enum: ["four-grid", "nine-grid", "twentyfive-grid"] } },
        ["id", "commandId"],
    ),
    toolDefinition("canvas_video_analyze", "抽帧并调用识图模型，把视频节点解析为分镜表脚本节点（自动连线）。", { id: { type: "string" } }, ["id"]),
    toolDefinition("canvas_video_trim", "剪辑视频节点：按 start/end（秒）导出片段为新视频节点。", { id: { type: "string" }, start: { type: "number" }, end: { type: "number" } }, ["id", "start", "end"]),
    toolDefinition(
        "canvas_video_compose",
        "把连入视频合成节点的视频/音频按连线顺序拼接导出为新视频节点；clips 可选，用于指定参与片段及出入点（秒）。",
        { id: { type: "string" }, clips: { type: "array", items: { type: "object", properties: { nodeId: { type: "string" }, start: { type: "number" }, end: { type: "number" } }, required: ["nodeId"], additionalProperties: false } } },
        ["id"],
    ),
    toolDefinition("canvas_save_template", "把指定节点组保存为工作流模板（账号级，跨画布可复用）。", { ids: { type: "array", items: { type: "string" }, minItems: 1 }, name: { type: "string" } }, ["ids", "name"]),
    toolDefinition("canvas_insert_template", "把工作流模板插入画布（自动避开现有节点）；先用 canvas_list_templates 查询可用模板。", { templateId: { type: "string" }, name: { type: "string" } }),
];
type OnlineAgentTab = "setup" | "chat" | "history" | "log";
type OnlineAgentLog = { id: string; time: string; title: string; data?: unknown };
type OnlineAgentLogContext = { model: string; running: boolean; confirmTools: boolean; messages: number; nodes: number; connections: number };
type OnlineLoopContext = { step: number };
type OnlineToolResult = { ok: true; message: string; data?: unknown } | { ok: false; message: string };
type OnlineExecutedToolCall = { toolCallId: string; name: string; result: OnlineToolResult };
type PendingOnlineToolContext = { messages: ResponseInputMessage[]; toolCalls: ResponseToolCall[]; assistantId: string; step: number; reasoningContent?: string };

type CanvasAssistantPanelProps = {
    nodes: CanvasNodeData[];
    selectedNodeIds: Set<string>;
    snapshot: CanvasAgentSnapshot;
    sessions: CanvasAssistantSession[];
    activeSessionId: string | null;
    onSelectNodeIds: (ids: Set<string>) => void;
    onSessionsChange: (sessions: CanvasAssistantSession[], activeSessionId: string | null) => void;
    onApplyOps: (ops?: CanvasAgentOp[]) => CanvasAgentSnapshot | Promise<CanvasAgentSnapshot>;
    canUndoOps: boolean;
    onUndoOps: () => CanvasAgentSnapshot | null;
    onPasteImage: (file: File) => void;
    agentMode: CanvasAgentMode;
    onAgentModeChange: (mode: CanvasAgentMode) => void;
    /** 外部入口（如空画布「输入灵感」）注入的待发送消息，nonce 变化时发送一次。 */
    promptRequest?: { text: string; nonce: number } | null;
    /** 账号级工作流模板列表，供 canvas_list_templates 只读查询。 */
    workflowTemplates: CanvasWorkflowTemplate[];
    closing: boolean;
    onCollapse: () => void;
};

export function CanvasAssistantPanel({
    nodes,
    selectedNodeIds,
    snapshot,
    sessions,
    activeSessionId,
    onSelectNodeIds,
    onSessionsChange,
    onApplyOps,
    canUndoOps,
    onUndoOps,
    onPasteImage,
    agentMode,
    onAgentModeChange,
    promptRequest,
    workflowTemplates,
    closing,
    onCollapse,
}: CanvasAssistantPanelProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const reducedMotion = useReducedMotion();
    const user = useUserStore((state) => state.user);
    const effectiveConfig = useEffectiveConfig();
    const cleanupImages = useAssetStore((state) => state.cleanupImages);
    const isAiConfigReady = useConfigStore((state) => state.isAiConfigReady);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const updateConfig = useConfigStore((state) => state.updateConfig);
    const confirmTools = useCanvasAgentStore((state) => state.confirmTools);
    const setAgentState = useCanvasAgentStore((state) => state.setAgentState);
    const [width, setWidth] = useState(() => (typeof window === "undefined" ? 560 : Math.min(960, Math.max(480, Math.round(window.innerWidth * 0.48)))));
    const [view, setView] = useState<OnlineAgentTab>("chat");
    const [chatMode, setChatMode] = useState<"talk" | "run">("talk");
    const [agentRuns, setAgentRuns] = useState<AgentRun[]>([]);
    const agentRunsRef = useRef<AgentRun[]>([]);
    const agentRunWatchersRef = useRef(new Map<string, () => void>());
    const agentRunSessionMapRef = useRef(new Map<string, string>());
    const agentRunsLoadedRef = useRef(false);
    const token = useUserStore((state) => state.token);
    const [prompt, setPrompt] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    const [deleteChatIds, setDeleteChatIds] = useState<string[]>([]);
    const [onlineLogs, setOnlineLogs] = useState<OnlineAgentLog[]>([]);
    const [resizing, setResizing] = useState(false);
    const [removedReferenceIds, setRemovedReferenceIds] = useState<Set<string>>(new Set());
    const [artSkill, setArtSkill] = useState<string | null>(() => (typeof window === "undefined" ? null : localStorage.getItem("canvas-agent-art-skill")));
    const [storySkill, setStorySkill] = useState<string | null>(() => (typeof window === "undefined" ? null : localStorage.getItem("canvas-agent-story-skill")));
    const [directorSkill, setDirectorSkill] = useState<string | null>(() => (typeof window === "undefined" ? null : localStorage.getItem("canvas-agent-director-skill")));
    const [localSessions, setLocalSessions] = useState<CanvasAssistantSession[]>(() => (sessions.length ? sessions : [createSession()]));
    const [localActiveSessionId, setLocalActiveSessionId] = useState<string | null>(activeSessionId);
    const snapshotRef = useRef(snapshot);
    const pendingToolContextRef = useRef(new Map<string, PendingOnlineToolContext>());

    useEffect(() => {
        if (!sessions.length) return;
        setLocalSessions(sessions);
        setLocalActiveSessionId(activeSessionId);
    }, [activeSessionId, sessions]);

    useEffect(() => {
        snapshotRef.current = snapshot;
    }, [snapshot]);

    useEffect(() => {
        onSessionsChange(localSessions, localActiveSessionId);
    }, [localActiveSessionId, localSessions, onSessionsChange]);

    const safeSessions = localSessions.length ? localSessions : [createSession()];
    const activeSession = useMemo(() => safeSessions.find((session) => session.id === localActiveSessionId) || safeSessions[0] || null, [localActiveSessionId, safeSessions]);
    const historySessions = safeSessions.filter((session) => session.messages.length > 0);
    const messages = activeSession?.messages || [];
    const activeModel = effectiveConfig.textModel || effectiveConfig.model;
    const selectedNodeKey = useMemo(() => Array.from(selectedNodeIds).sort().join(","), [selectedNodeIds]);
    const allSelectedReferences = useMemo(() => buildAssistantReferences(nodes, selectedNodeIds), [nodes, selectedNodeIds]);
    const selectedReferences = useMemo(() => allSelectedReferences.filter((item) => !removedReferenceIds.has(item.id)), [allSelectedReferences, removedReferenceIds]);
    const iconButtonStyle = { color: theme.node.muted };

    // Agent 输入框 @ 精确引用：全画布资源节点作为候选（对齐 TapNow @ 引用具体节点）。
    const [mentionNonce, setMentionNonce] = useState(0);
    const mentionReferences = useMemo(
        () => buildCanvasResourceReferences(snapshot.nodes, snapshot.connections).map((reference) => ({ ...reference, active: true })),
        [snapshot.nodes, snapshot.connections],
    );
    const resolveMentionedReferences = (text: string) => {
        const nodeById = new Map(snapshot.nodes.map((node) => [node.id, node]));
        return mentionReferences
            .filter((reference) => text.includes(reference.label))
            .map((reference) => nodeById.get(reference.nodeId))
            .filter((node): node is CanvasNodeData => Boolean(node))
            .map(nodeToReference)
            .filter((item): item is CanvasAssistantReference => Boolean(item));
    };
    /** 「+」轻量引用：有选中节点时把它们的引用标签插入输入框，否则弹出 @ 候选。 */
    const handleQuickReference = () => {
        const labels = mentionReferences.filter((reference) => selectedNodeIds.has(reference.nodeId)).map((reference) => reference.label);
        if (!labels.length) {
            setMentionNonce((value) => value + 1);
            return;
        }
        setPrompt((current) => `${current}${current && !/\s$/.test(current) ? " " : ""}${labels.join(" ")} `);
    };

    useEffect(() => {
        setRemovedReferenceIds(new Set());
    }, [selectedNodeKey]);

    const updateSession = (sessionId: string, updater: (session: CanvasAssistantSession) => CanvasAssistantSession) => {
        setLocalSessions((prev) => prev.map((session) => (session.id === sessionId ? updater(session) : session)));
    };

    const appendMessage = (sessionId: string, message: CanvasAssistantMessage) => {
        updateSession(sessionId, (session) => ({
            ...session,
            title: session.messages.length ? session.title : message.text.slice(0, 18) || "新对话",
            messages: [...session.messages, message],
            updatedAt: new Date().toISOString(),
        }));
    };
    const addOnlineLog = (title: string, data?: unknown) => setOnlineLogs((prev) => [{ id: nanoid(), time: new Date().toLocaleTimeString(), title, data }, ...prev].slice(0, 80));

    const upsertMessage = (sessionId: string, message: CanvasAssistantMessage) => {
        updateSession(sessionId, (session) => {
            const exists = session.messages.some((item) => item.id === message.id);
            return {
                ...session,
                title: session.messages.length ? session.title : message.text.slice(0, 18) || "新对话",
                messages: exists ? session.messages.map((item) => (item.id === message.id ? { ...item, ...message } : item)) : [...session.messages, message],
                updatedAt: new Date().toISOString(),
            };
        });
    };

    const startChatSession = () => {
        if (activeSession && activeSession.messages.length === 0) {
            setLocalActiveSessionId(activeSession.id);
            return;
        }
        const session = createSession();
        setLocalSessions((prev) => [session, ...prev]);
        setLocalActiveSessionId(session.id);
    };

    const removeSessions = (ids: string[]) => {
        const next = safeSessions.filter((session) => !ids.includes(session.id));
        if (!next.length) {
            const session = createSession();
            setLocalSessions([session]);
            setLocalActiveSessionId(session.id);
        } else {
            setLocalSessions(next);
            setLocalActiveSessionId(localActiveSessionId && ids.includes(localActiveSessionId) ? next[0].id : localActiveSessionId);
        }
        cleanupImages({ sessions: next });
    };

    const clearSessions = () => {
        const session = createSession();
        setLocalSessions([session]);
        setLocalActiveSessionId(session.id);
        cleanupImages({ sessions: [session] });
    };

    const upsertAgentRun = (run: AgentRun) => {
        setAgentRuns((current) => {
            const next = current.some((item) => item.id === run.id) ? current.map((item) => (item.id === run.id ? run : item)) : [run, ...current];
            agentRunsRef.current = next;
            return next;
        });
    };

    const watchAgentRun = (runId: string) => {
        if (agentRunWatchersRef.current.has(runId)) return;
        const close = watchVozebAgentRun(runId, {
            onRun: (partial) => {
                const current = agentRunsRef.current.find((run) => run.id === runId);
                upsertAgentRun(mapVozebAgentRun({ ...current, ...partial, id: runId }, current));
                if (["completed", "failed", "cancelled"].includes(String(partial.status))) agentRunWatchersRef.current.delete(runId);
            },
            onOps: (ops) => void onApplyOps(mapVozebCanvasOps(ops)),
            onReply: (text) => {
                const sessionId = agentRunSessionMapRef.current.get(runId);
                if (sessionId && text.trim()) appendMessage(sessionId, { id: nanoid(), role: "assistant", text });
            },
            onDone: () => agentRunWatchersRef.current.delete(runId),
        });
        agentRunWatchersRef.current.set(runId, close);
    };

    useEffect(
        () => () => {
            agentRunWatchersRef.current.forEach((close) => close());
            agentRunWatchersRef.current.clear();
        },
        [],
    );

    // 加载本画布的 Agent Run（VOZEB 服务端执行，重开画布后恢复进度并继续监听）
    useEffect(() => {
        if (!token || agentRunsLoadedRef.current) return;
        agentRunsLoadedRef.current = true;
        void listCreativeAgentRuns("canvas", { projectId: snapshot.projectId, limit: 20 })
            .then((runs) => {
                if (!runs.length) return;
                const mine = runs.map((run) => mapVozebAgentRun(run));
                agentRunsRef.current = mine;
                setAgentRuns(mine);
                mine.forEach((run) => {
                    if (!["completed", "failed", "cancelled"].includes(run.status)) watchAgentRun(run.id);
                });
            })
            .catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, snapshot.projectId]);

    // 任务规划模式：一次规划出创作计划（简报+视觉方向+产物清单），确认后编译为画布节点并按依赖执行
    const startAgentRunFlow = async (text: string) => {
        const requestConfig = { ...effectiveConfig, model: effectiveConfig.textModel || effectiveConfig.model };
        if (!isAiConfigReady(requestConfig, requestConfig.model)) {
            openConfigDialog(true);
            return;
        }
        const session = activeSession || createSession();
        if (!activeSession) {
            setLocalSessions([session]);
            setLocalActiveSessionId(session.id);
        }
        appendMessage(session.id, { id: nanoid(), role: "user", text });
        setPrompt("");
        setIsRunning(true);
        try {
            const { run } = await createCreativeAgentRun({
                clientRequestId: nanoid(),
                surface: "canvas",
                projectId: snapshot.projectId,
                prompt: text,
                snapshot: buildVozebCanvasSnapshot(snapshotRef.current),
                assetIds: [],
                skillIds: [],
                modelIds: [],
            });
            agentRunSessionMapRef.current.set(run.id, session.id);
            upsertAgentRun(mapVozebAgentRun(run));
            addOnlineLog("Agent Run 已创建（VOZEB 服务端执行）", { runId: run.id });
            appendMessage(session.id, { id: nanoid(), role: "tool", title: "创作任务", text: "", detail: { kind: "agentRun", runId: run.id } });
            watchAgentRun(run.id);
        } catch (error) {
            appendMessage(session.id, { id: nanoid(), role: "error", title: "规划失败", text: error instanceof Error ? error.message : "创作计划生成失败" });
        } finally {
            setIsRunning(false);
        }
    };

    const sendMessage = async (text: string, history: CanvasAssistantMessage[], savedReferences?: CanvasAssistantReference[]) => {
        const requestConfig = { ...effectiveConfig, model: effectiveConfig.textModel || effectiveConfig.model };
        if (!isAiConfigReady(requestConfig, requestConfig.model)) {
            openConfigDialog(true);
            return;
        }

        const session = activeSession || createSession();
        if (!activeSession) {
            setLocalSessions([session]);
            setLocalActiveSessionId(session.id);
        }

        const refs = savedReferences || mergeAssistantReferences(selectedReferences, resolveMentionedReferences(text));
        const userMessage: CanvasAssistantMessage = { id: nanoid(), role: "user", text, references: refs };
        const assistantId = nanoid();
        appendMessage(session.id, userMessage);
        addOnlineLog("发送请求", { text, selectedNodeIds: snapshotRef.current.selectedNodeIds, nodeCount: snapshotRef.current.nodes.length, connectionCount: snapshotRef.current.connections.length });
        setPrompt("");
        setIsRunning(true);
        void runOnlineAgentStep(session.id, assistantId, history, userMessage, { step: 1 });
    };

    const runOnlineAgentStep = async (sessionId: string, assistantId: string, history: CanvasAssistantMessage[], userMessage: CanvasAssistantMessage, loop: OnlineLoopContext) => {
        const requestConfig = { ...effectiveConfig, model: effectiveConfig.textModel || effectiveConfig.model };
        try {
            setIsRunning(true);
            const messages = await buildToolAgentMessages(snapshotRef.current, history, userMessage, { artSkill: artSkill || undefined, storySkill: storySkill || undefined, directorSkill: directorSkill || undefined });
            addOnlineLog(`Agent Tool Loop ${loop.step} 开始`, { toolChoice: "required" });
            let streamed = "";
            const result = await requestToolResponse({ ...requestConfig, systemPrompt: "" }, messages, ONLINE_AGENT_TOOLS, "required", (text) => {
                streamed = text;
                if (text.trim()) upsertMessage(sessionId, { id: assistantId, role: "assistant", text });
            });
            addOnlineLog("模型工具回复", result);
            if (result.toolCalls.length) {
                const writableCalls = result.toolCalls.filter(isWritableToolCall);
                if (writableCalls.length && requiresOnlineApproval(result.toolCalls, confirmTools)) {
                    upsertMessage(sessionId, { id: assistantId, role: "assistant", text: result.content || streamed || "准备执行工具，等待确认。", reasoningContent: result.reasoningContent });
                    const toolMessageId = nanoid();
                    pendingToolContextRef.current.set(toolMessageId, { messages, toolCalls: result.toolCalls, assistantId, step: loop.step });
                    const toolMessage: CanvasAssistantMessage = { id: toolMessageId, role: "tool", title: "确认工具调用", text: summarizeToolCalls(result.toolCalls), detail: { status: "pending", step: loop.step, toolCalls: result.toolCalls, impact: buildToolImpact(result.toolCalls, snapshotRef.current) } };
                    appendMessage(sessionId, toolMessage);
                    addOnlineLog("等待用户确认", result.toolCalls);
                    return;
                }
                await continueOnlineToolLoop(sessionId, assistantId, messages, result, loop.step);
            } else {
                if (!result.content.trim()) throw new Error("模型没有返回工具调用，画布操作未执行。");
                upsertMessage(sessionId, { id: assistantId, role: "assistant", text: result.content || streamed || "没有返回内容。", reasoningContent: result.reasoningContent });
                addOnlineLog(`Agent Tool Loop ${loop.step} 结束`, { reply: result.content });
            }
        } catch (error) {
            addOnlineLog("请求失败", error instanceof Error ? error.message : error);
            appendMessage(sessionId, { id: nanoid(), role: "error", title: "操作失败", text: error instanceof Error ? error.message : "操作失败" });
        } finally {
            setIsRunning(false);
        }
    };

    const continueOnlineToolLoop = async (sessionId: string, assistantId: string, messages: ResponseInputMessage[], result: { content: string; toolCalls: ResponseToolCall[]; reasoningContent?: string }, step: number) => {
        const toolResults = await executeOnlineToolCalls(result.toolCalls);
        addOnlineLog("工具执行结果", toolResults);
        appendMessage(sessionId, {
            id: nanoid(),
            role: "tool",
            title: "工具自动执行完成",
            text: toolResults.map((item) => toolResultText(item.result)).join("\n"),
            detail: { status: "completed", step, toolCalls: result.toolCalls, results: toolResults },
        });
        await continueOnlineToolLoopAfterResults(sessionId, assistantId, messages, result.toolCalls, toolResults, step, result.reasoningContent);
    };

    const continueOnlineToolLoopAfterResults = async (sessionId: string, assistantId: string, messages: ResponseInputMessage[], toolCalls: ResponseToolCall[], toolResults: OnlineExecutedToolCall[], step: number, reasoningContent?: string) => {
        const nextMessages: ResponseInputMessage[] = [...messages, ...toolCalls.map((call) => toolCallToResponseInput(call, reasoningContent)), ...toolResults.map((item) => ({ role: "tool" as const, tool_call_id: item.toolCallId, content: JSON.stringify(item.result) }))];
        if (step >= ONLINE_AGENT_MAX_STEPS) {
            upsertMessage(sessionId, { id: assistantId, role: "assistant", text: toolResults.map((item) => toolResultText(item.result)).join("\n") || "工具已执行。" });
            addOnlineLog("Agent Tool Loop 达到步数上限", { maxSteps: ONLINE_AGENT_MAX_STEPS });
            return;
        }
        const requestConfig = { ...effectiveConfig, model: effectiveConfig.textModel || effectiveConfig.model };
        let streamed = "";
        const next = await requestToolResponse({ ...requestConfig, systemPrompt: "" }, nextMessages, ONLINE_AGENT_TOOLS, "auto", (text) => {
            streamed = text;
            if (text.trim()) upsertMessage(sessionId, { id: assistantId, role: "assistant", text });
        });
        addOnlineLog(`Agent Tool Loop ${step + 1} 回复`, next);
        if (next.toolCalls.length) {
            const writableCalls = next.toolCalls.filter(isWritableToolCall);
            if (writableCalls.length && requiresOnlineApproval(next.toolCalls, confirmTools)) {
                upsertMessage(sessionId, { id: assistantId, role: "assistant", text: next.content || streamed || "准备执行工具，等待确认。", reasoningContent: next.reasoningContent });
                const toolMessageId = nanoid();
                pendingToolContextRef.current.set(toolMessageId, { messages: nextMessages, toolCalls: next.toolCalls, assistantId, step: step + 1, reasoningContent: next.reasoningContent });
                appendMessage(sessionId, { id: toolMessageId, role: "tool", title: "确认工具调用", text: summarizeToolCalls(next.toolCalls), detail: { status: "pending", step: step + 1, toolCalls: next.toolCalls, impact: buildToolImpact(next.toolCalls, snapshotRef.current) } });
                addOnlineLog("等待用户确认", next.toolCalls);
                return;
            }
            await continueOnlineToolLoop(sessionId, assistantId, nextMessages, next, step + 1);
            return;
        }
        upsertMessage(sessionId, { id: assistantId, role: "assistant", text: next.content || streamed || toolResults.map((item) => toolResultText(item.result)).join("\n") || "工具已执行。", reasoningContent: next.reasoningContent });
    };

    const executeOps = async (ops: CanvasAgentOp[]) => {
        const beforeSnapshot = snapshotRef.current;
        const before = snapshotSignature(beforeSnapshot);
        const next = await onApplyOps(ops);
        snapshotRef.current = next;
        // 副作用 op（生成/重跑/工具类）的结果异步落地，签名比对看不出来，恒算 changed
        const hasSideEffect = ops.some((op) => CANVAS_AGENT_SIDE_EFFECT_OP_TYPES.has(op.type));
        const changed = before !== snapshotSignature(next) || hasSideEffect;
        const noopReason = changed ? "" : explainNoop(ops, beforeSnapshot);
        return { changed, ops, ranGeneration: hasSideEffect, noopReason, before: JSON.parse(before), after: JSON.parse(snapshotSignature(next)) };
    };

    const executeOnlineTool = async (name: string, args: Record<string, unknown>): Promise<OnlineToolResult> => {
        const current = snapshotRef.current;
        try {
            if (name === "canvas_get_state") return { ok: true, message: describeCanvasSnapshot(current), data: compactSnapshot(current) };
            if (name === "canvas_export_snapshot") return { ok: true, message: describeCanvasSnapshot(current), data: compactSnapshot(current) };
            if (name === "canvas_get_selection") {
                const ids = new Set(current.selectedNodeIds || []);
                return { ok: true, message: `当前选中 ${ids.size} 个节点。`, data: { nodes: compactSnapshot({ ...current, nodes: current.nodes.filter((node) => ids.has(node.id)) }).nodes } };
            }
            if (name === "canvas_list_templates") {
                const list = workflowTemplates.map((template) => ({ id: template.id, name: template.name, nodes: template.nodes.length, connections: template.connections.length }));
                return { ok: true, message: list.length ? `共 ${list.length} 个模板。` : "还没有保存过工作流模板。", data: { templates: list } };
            }
            const ops = onlineToolToOps(name, args, current, effectiveConfig);
            const result = await executeOps(ops);
            return { ok: result.changed, message: result.changed ? summarizeCanvasAgentOps(ops) || "画布操作已执行。" : result.noopReason, data: result };
        } catch (error) {
            return { ok: false, message: error instanceof Error ? error.message : "工具执行失败" };
        }
    };

    const executeOnlineToolCall = async (toolCall: ResponseToolCall): Promise<OnlineExecutedToolCall> => {
        try {
            const result = await executeOnlineTool(toolCall.function.name, parseToolArguments(toolCall.function.arguments));
            return { toolCallId: toolCall.id, name: toolCall.function.name, result };
        } catch (error) {
            return { toolCallId: toolCall.id, name: toolCall.function.name, result: { ok: false, message: error instanceof Error ? error.message : "工具参数错误" } };
        }
    };

    const executeOnlineToolCalls = async (toolCalls: ResponseToolCall[]) => {
        const results: OnlineExecutedToolCall[] = [];
        let stopped = false;
        for (const toolCall of toolCalls) {
            if (stopped) {
                results.push({ toolCallId: toolCall.id, name: toolCall.function.name, result: { ok: false, message: "前一个工具调用失败，未继续执行。" } });
                continue;
            }
            const result = await executeOnlineToolCall(toolCall);
            results.push(result);
            if (!result.result.ok) stopped = true;
        }
        return results;
    };

    const approveOnlineTool = async (messageId: string) => {
        const message = safeSessions.flatMap((session) => session.messages).find((item) => item.id === messageId);
        const detail = objectDetail(message?.detail);
        const pendingContext = pendingToolContextRef.current.get(messageId);
        const toolCalls = pendingContext?.toolCalls || toolCallsFromDetail(detail);
        const previousMessages = pendingContext?.messages || [];
        const session = safeSessions.find((session) => session.messages.some((item) => item.id === messageId));
        addOnlineLog("批准工具", { messageId, toolCalls });
        const assistantId = pendingContext?.assistantId || "";
        if (!session) return;
        if (!toolCalls.length || !previousMessages.length || !assistantId) {
            upsertMessage(session.id, { id: messageId, role: "tool", title: "工具执行失败", text: "工具上下文不完整，无法执行。", detail: { ...detail, status: "failed" } });
            return;
        }
        try {
            setIsRunning(true);
            const results = await executeOnlineToolCalls(toolCalls);
            addOnlineLog("工具执行结果", results);
            upsertMessage(session.id, { id: messageId, role: "tool", title: "工具执行完成", text: results.map((item) => toolResultText(item.result)).join("\n"), detail: { ...detail, results, status: "completed" } });
            pendingToolContextRef.current.delete(messageId);
            await continueOnlineToolLoopAfterResults(session.id, assistantId, previousMessages, toolCalls, results, pendingContext?.step || Number(detail.step) || 1, pendingContext?.reasoningContent);
        } catch (error) {
            addOnlineLog("工具续跑失败", error instanceof Error ? error.message : error);
            appendMessage(session.id, { id: nanoid(), role: "error", title: "操作失败", text: error instanceof Error ? error.message : "操作失败" });
        } finally {
            setIsRunning(false);
        }
    };

    const rejectOnlineTool = (messageId: string) => {
        const session = safeSessions.find((session) => session.messages.some((item) => item.id === messageId));
        addOnlineLog("拒绝工具", { messageId });
        pendingToolContextRef.current.delete(messageId);
        if (session) upsertMessage(session.id, { id: messageId, role: "tool", title: "已拒绝执行", text: "工具调用已取消", detail: { ...objectDetail(session.messages.find((item) => item.id === messageId)?.detail), status: "rejected" } });
    };

    const submit = async () => {
        const text = prompt.trim();
        if (!text || isRunning) return;
        if (chatMode === "run") {
            await startAgentRunFlow(text);
            return;
        }
        await sendMessage(text, messages);
    };

    // 外部入口（空画布「输入灵感」）注入的消息：填入输入框并直接发送一次。
    const handledPromptRequestRef = useRef(0);
    useEffect(() => {
        if (!promptRequest || promptRequest.nonce === handledPromptRequestRef.current) return;
        handledPromptRequestRef.current = promptRequest.nonce;
        setPrompt(promptRequest.text);
        void sendMessage(promptRequest.text, messages);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [promptRequest]);

    const addImagesToCanvas = (files: FileList | File[] | null) => {
        const file = Array.from(files || []).find((item) => item.type.startsWith("image/"));
        if (file) onPasteImage(file);
    };

    const startResize = () => {
        const move = (event: MouseEvent) => setWidth(Math.min(960, Math.max(320, window.innerWidth - event.clientX)));
        const stop = () => {
            setResizing(false);
            document.body.style.cursor = "";
            document.body.style.userSelect = "";
            document.removeEventListener("mousemove", move);
            document.removeEventListener("mouseup", stop);
        };
        setResizing(true);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
        document.addEventListener("mousemove", move);
        document.addEventListener("mouseup", stop);
    };

    const collapse = () => {
        onCollapse();
    };

    const onlineContent = (
        <>
            {view === "setup" ? (
                <OnlineAgentSetupView theme={theme} activeModel={activeModel} onOpenConfig={() => openConfigDialog(true)} />
            ) : (
                <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                    {view === "history" ? (
                        <AssistantHistory
                            sessions={historySessions}
                            activeSession={activeSession}
                            onOpen={(id) => {
                                setLocalActiveSessionId(id);
                                setView("chat");
                            }}
                            onDelete={(id) => setDeleteChatIds([id])}
                        />
                    ) : view === "log" ? (
                        <OnlineAgentLogView
                            logs={onlineLogs}
                            theme={theme}
                            context={{ model: activeModel, running: isRunning, confirmTools, messages: messages.length, nodes: snapshot.nodes.length, connections: snapshot.connections.length }}
                            onClear={() => setOnlineLogs([])}
                        />
                    ) : messages.length ? (
                        <>
                            {messages.map((message) => (
                                <div key={message.id} className="space-y-2">
                                    {objectDetail(message.detail).kind === "agentRun" && agentRuns.find((run) => run.id === objectDetail(message.detail).runId) ? (
                                        <AgentRunCard
                                            run={agentRuns.find((run) => run.id === objectDetail(message.detail).runId)!}
                                            theme={theme}
                                            onStart={() => {}}
                                            onPause={(run) => void controlCreativeAgentRun(run.id, "pause")}
                                            onResume={(run) => void controlCreativeAgentRun(run.id, "resume").then(() => watchAgentRun(run.id))}
                                            onCancel={(run) => void controlCreativeAgentRun(run.id, "cancel")}
                                            onRetryTask={(run, taskId) => void retryCreativeAgentTask(run.id, taskId).then(() => watchAgentRun(run.id))}
                                        />
                                    ) : (
                                        <AgentChatMessage item={assistantMessageToChatMessage(message)} theme={theme} user={user} onRejectTool={rejectOnlineTool} onApproveTool={approveOnlineTool} />
                                    )}
                                    {message.references?.length ? <MessageReferences message={message} /> : null}
                                </div>
                            ))}
                            {isRunning ? <AgentWorkingMessage theme={theme} /> : null}
                        </>
                    ) : (
                        <motion.div
                            className="canvas-agent-empty-intro flex h-full flex-col justify-center px-2 pb-12 text-left"
                            initial="hidden"
                            animate="show"
                            variants={{ hidden: {}, show: { transition: { delayChildren: 0.12, staggerChildren: 0.1 } } }}
                        >
                            <motion.div variants={{ hidden: { opacity: 0, y: 72 }, show: { opacity: 1, y: 0, transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } } }}>
                                <div className="flex items-center gap-2 text-sm font-medium opacity-65" style={{ color: theme.node.text }}>
                                    <Bot className="size-4" />
                                    你好，{user?.displayName || user?.username || "创作者"}！
                                </div>
                                <h2 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.045em]" style={{ color: theme.node.text }}>
                                    今天想创作什么？
                                </h2>
                            </motion.div>
                            <motion.div
                                className="mt-5 grid w-full grid-cols-2 gap-2"
                                variants={{ hidden: {}, show: { transition: { delayChildren: 0.25, staggerChildren: 0.1 } } }}
                            >
                                {SUGGESTION_CARDS.slice(0, 2).map((card) => (
                                    <motion.button
                                        key={card.title}
                                        type="button"
                                        variants={{
                                            hidden: { opacity: 0, y: 42, scale: 0.98 },
                                            show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.52, ease: [0.16, 1, 0.3, 1] } },
                                        }}
                                        className="canvas-agent-suggestion-card min-h-[120px] rounded-xl border px-4 py-3.5 text-left transition hover:-translate-y-0.5 hover:opacity-90"
                                        style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}
                                        onClick={() => setPrompt(card.prompt)}
                                    >
                                        <span className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: theme.ui.accent }}>
                                            <card.icon className="size-3.5" />
                                            {card.title}
                                        </span>
                                        <span className="mt-1 block text-[11px] leading-relaxed opacity-60">{card.description}</span>
                                    </motion.button>
                                ))}
                            </motion.div>
                        </motion.div>
                    )}
                </div>
            )}

            {view === "chat" ? (
                <>
                    {selectedReferences.length ? (
                        <div className="thin-scrollbar flex max-w-full gap-1.5 overflow-x-auto px-3 pb-1">
                            {selectedReferences.map((item, index) => (
                                <AssistantReferenceChip
                                    key={item.id}
                                    item={item}
                                    label={assistantImageReferenceLabel(selectedReferences, index)}
                                    onRemove={() => {
                                        setRemovedReferenceIds((prev) => new Set(prev).add(item.id));
                                        if (selectedNodeIds.has(item.id)) onSelectNodeIds(new Set(Array.from(selectedNodeIds).filter((nodeId) => nodeId !== item.id)));
                                    }}
                                />
                            ))}
                        </div>
                    ) : null}
                    <div className="flex items-center justify-end gap-2 px-3 pb-1.5">
                        <span className="text-[11px]" style={{ color: theme.node.muted }}>
                            {chatMode === "run" ? "任务规划：一次出完整创作计划，确认后按依赖批量执行" : "对话操作：逐步指挥 Agent 操作画布"}
                        </span>
                        <Segmented
                            size="small"
                            value={chatMode}
                            onChange={(value) => setChatMode(value as "talk" | "run")}
                            options={[
                                { label: "对话操作", value: "talk" },
                                { label: "任务规划", value: "run" },
                            ]}
                        />
                    </div>
                    <AgentChatComposer
                        prompt={prompt}
                        sending={isRunning}
                        placeholder="描述你想让 Agent 如何操作画布，@ 可引用画布节点"
                        theme={theme}
                        onPromptChange={setPrompt}
                        onSubmit={submit}
                        onAddFiles={addImagesToCanvas}
                        mentionReferences={mentionReferences}
                        mentionRequestNonce={mentionNonce}
                        onQuickReference={handleQuickReference}
                        left={
                            <>
                                {canUndoOps ? (
                                    <Tooltip title="撤销上一次 Agent 操作">
                                        <Button type="text" shape="circle" className="!h-9 !w-9 !min-w-9" style={{ color: theme.node.muted }} icon={<Undo2 className="size-4" />} onClick={() => onUndoOps()} aria-label="撤销 Agent 操作" />
                                    </Tooltip>
                                ) : null}
                                <CanvasPromptLibrary onSelect={setPrompt} />
                                <AgentTextModelPicker config={effectiveConfig} value={effectiveConfig.textModel} onChange={(model) => updateConfig("textModel", model)} />
                                <AgentSkillPicker kind="art" value={artSkill} onChange={setArtSkill} />
                                <AgentSkillPicker kind="story" value={storySkill} onChange={setStorySkill} />
                                <AgentSkillPicker kind="director" value={directorSkill} onChange={setDirectorSkill} />
                            </>
                        }
                    />
                </>
            ) : null}

            <Modal
                title="删除对话记录？"
                open={deleteChatIds.length > 0}
                centered
                onCancel={() => setDeleteChatIds([])}
                footer={
                    <>
                        <Button onClick={() => setDeleteChatIds([])}>取消</Button>
                        <Button
                            danger
                            type="primary"
                            onClick={() => {
                                deleteChatIds.length === historySessions.length ? clearSessions() : removeSessions(deleteChatIds);
                                setDeleteChatIds([]);
                            }}
                        >
                            删除
                        </Button>
                    </>
                }
            >
                <p className="text-sm opacity-60">将删除 {deleteChatIds.length} 条对话记录，此操作不可撤销。</p>
            </Modal>
        </>
    );

    return (
        <motion.div
            className="canvas-agent-overlay pointer-events-none fixed inset-y-0 right-0 z-[160] flex shrink-0"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: closing ? 0 : width + 1, opacity: closing ? 0 : 1 }}
            transition={{ duration: resizing || reducedMotion ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: "clip", pointerEvents: closing ? "none" : undefined, maxWidth: "calc(100vw - 12px)" }}
        >
            <motion.aside
                className="canvas-agent-drawer pointer-events-auto relative flex min-w-0 shrink-0 flex-col border-l"
                initial={{ x: 72 }}
                animate={{ x: closing ? 48 : 0 }}
                transition={{ duration: resizing || reducedMotion ? 0 : PANEL_MOTION_SECONDS, ease: [0.22, 1, 0.36, 1] }}
                style={{ width, maxWidth: "100%", background: theme.ui.materialElevated, borderColor: theme.node.stroke, boxShadow: theme.ui.shadow, color: theme.node.text }}
            >
                <button type="button" className="absolute inset-y-0 left-0 z-40 w-4 -translate-x-1/2 cursor-col-resize" onMouseDown={startResize} aria-label="调整右侧面板宽度" />
                <header className="flex h-12 items-center justify-between border-b px-3" style={{ borderColor: theme.node.stroke }}>
                    <div className="flex min-w-0 items-center gap-2">
                        <Tooltip title={agentMode === "online" ? "切换到本地 Agent" : "切换到网站 Agent"}>
                            <button type="button" className="grid size-8 place-items-center rounded-lg transition hover:bg-white/10" style={{ color: theme.node.muted }} onClick={() => onAgentModeChange(agentMode === "online" ? "local" : "online")} aria-label={agentMode === "online" ? "切换到本地 Agent" : "切换到网站 Agent"}>
                                <Bot className="size-4" />
                            </button>
                        </Tooltip>
                        <div className="min-w-0">
                            <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold leading-5 transition hover:opacity-70" onClick={() => { startChatSession(); setView("chat"); }}>
                                新建对话
                                <ChevronDown className="size-3.5 opacity-55" />
                            </button>
                            <div className="hidden truncate text-xs" style={{ color: theme.node.muted }}>
                                画布助手
                            </div>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <Tooltip title="对话历史">
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<History className="size-4" />} onClick={() => setView((current) => (current === "history" ? "chat" : "history"))} aria-label="打开对话历史" />
                        </Tooltip>
                        <Tooltip title={confirmTools ? "已开启所有操作确认" : "高成本操作仍会要求确认"}>
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={{ ...iconButtonStyle, color: confirmTools ? theme.ui.accent : theme.node.muted }} icon={<ShieldCheck className="size-4" />} onClick={() => setAgentState({ confirmTools: !confirmTools })} aria-pressed={confirmTools} aria-label="切换 Agent 操作确认" />
                        </Tooltip>
                        <Tooltip title="Agent 设置">
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<Settings2 className="size-4" />} onClick={() => setView((current) => (current === "setup" ? "chat" : "setup"))} aria-label="打开 Agent 设置" />
                        </Tooltip>
                        <Tooltip title="执行日志">
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<Cpu className="size-4" />} onClick={() => setView((current) => (current === "log" ? "chat" : "log"))} aria-label="打开 Agent 执行日志" />
                        </Tooltip>
                        <Tooltip title="收起对话">
                            <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" style={iconButtonStyle} icon={<PanelRightClose className="size-4" />} onClick={collapse} aria-label="收起 Agent" />
                        </Tooltip>
                    </div>
                </header>
                {agentMode === "local" ? <CanvasLocalAgentPanel embedded snapshot={snapshot} canUndoOps={canUndoOps} onApplyOps={onApplyOps} onUndoOps={onUndoOps} /> : onlineContent}
            </motion.aside>
        </motion.div>
    );
}

function AgentSkillPicker({ kind, value, onChange }: { kind: "art" | "story" | "director"; value: string | null; onChange: (value: string | null) => void }) {
    const options = kind === "art" ? ART_SKILL_OPTIONS : kind === "story" ? STORY_SKILL_OPTIONS : DIRECTOR_SKILL_OPTIONS;
    const storageKey = kind === "art" ? "canvas-agent-art-skill" : kind === "story" ? "canvas-agent-story-skill" : "canvas-agent-director-skill";
    return (
        <Select
            size="small"
            style={{ minWidth: 100 }}
            value={value || undefined}
            placeholder={kind === "art" ? "美术风格" : kind === "story" ? "故事风格" : "导演风格"}
            allowClear
            onChange={(next) => {
                onChange(next || null);
                localStorage.setItem(storageKey, next || "");
            }}
            options={options.map(({ label, value: optionValue }) => ({ label, value: optionValue }))}
        />
    );
}

function AgentTextModelPicker({ config, value, onChange }: { config: AiConfig; value: string; onChange: (model: string) => void }) {
    const options = useMemo(() => Array.from(new Set([value, ...selectableModelsByCapability(config, "text")].filter((model): model is string => Boolean(model)))), [config, value]);
    const current = value || "";
    const selectValue = current && options.includes(current) ? current : "";
    const selectOptions: Array<{ value: string; label: ReactNode; title?: string; disabled?: boolean }> = options.length
        ? options.map((model) => ({
              value: model,
              label: (
                  <span className="flex min-w-0 items-center gap-2">
                      <AgentModelIcon model={model} />
                      <span className="min-w-0 flex-1 truncate">{modelOptionName(model)}</span>
                      <span className="shrink-0 text-xs opacity-55">{resolveModelChannel(config, model).name}</span>
                  </span>
              ),
              title: `${modelOptionName(model)} ${resolveModelChannel(config, model).name}`,
          }))
        : [{ value: "__empty_text_model__", label: "暂无文本模型", disabled: true }];
    return (
        <Select
            value={selectValue || undefined}
            options={selectOptions}
            popupMatchSelectWidth={false}
            placement="bottomLeft"
            className="h-7 min-w-0 max-w-[220px] text-xs"
            placeholder={
                <span className="inline-flex min-w-0 items-center gap-1.5">
                    <AgentModelIcon model="" />
                    <span className="truncate">选择文本模型</span>
                </span>
            }
            popupRender={(menu) => (
                <div
                    data-canvas-no-zoom
                    className="canvas-no-zoom-popup w-72 max-w-[calc(100vw-24px)]"
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                >
                    {menu}
                </div>
            )}
            title={current ? `${modelOptionName(current)} · ${resolveModelChannel(config, current).name}` : "选择文本模型"}
            onChange={(next) => {
                if (next && next !== "__empty_text_model__") onChange(next);
            }}
            onMouseDown={(event: ReactMouseEvent) => event.stopPropagation()}
        />
    );
}

function AgentModelIcon({ model }: { model: string }) {
    const icon = resolveModelIcon(modelOptionName(model));
    return icon ? <img src={icon} alt="" className="size-4 shrink-0 dark:invert" /> : <Cpu className="size-4 shrink-0 opacity-70" />;
}

function resolveModelIcon(model: string) {
    const name = model.toLowerCase();
    if (name.includes("claude") || name.includes("anthropic")) return "/icons/claude.svg";
    if (name.includes("gemini") || name.includes("google")) return "/icons/gemini.svg";
    if (name.includes("gpt") || name.includes("openai")) return "/icons/openai.svg";
    if (name.includes("grok")) return "/icons/grok.svg";
    if (name.includes("deepseek")) return "/icons/deepseek.svg";
    if (name.includes("glm")) return "/icons/glm.svg";
    return "";
}

function AssistantHistory({ sessions, activeSession, onOpen, onDelete }: { sessions: CanvasAssistantSession[]; activeSession: CanvasAssistantSession | null; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <div className="space-y-3">
            <div className="text-sm" style={{ color: theme.node.muted }}>
                {sessions.length ? `${sessions.length} 条历史` : "暂无历史"}
            </div>
            {sessions.map((session) => (
                <div key={session.id} className="rounded-lg border px-2.5 py-1.5 transition" style={{ borderColor: session.id === activeSession?.id ? theme.node.text : theme.node.stroke, background: "transparent", color: theme.node.text }}>
                    <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-1.5">
                                {session.id === activeSession?.id ? (
                                    <span className="shrink-0 text-[10px] font-medium" style={{ color: theme.node.text }}>
                                        当前
                                    </span>
                                ) : null}
                                <div className="truncate text-sm font-medium leading-5">{session.title}</div>
                            </div>
                            <div className="truncate text-[11px] leading-4 opacity-65">{sessionPreview(session)}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                            <span className="text-[10px] opacity-55">{formatSessionTime(session.updatedAt || session.createdAt)}</span>
                            <Button size="small" className="!h-6 !px-2" onClick={() => onOpen(session.id)}>
                                进入
                            </Button>
                            <Tooltip title="删除记录">
                                <Button size="small" danger type="text" className="!h-6 !w-6 !min-w-6" icon={<Trash2 className="size-3.5" />} onClick={() => onDelete(session.id)} />
                            </Tooltip>
                        </div>
                    </div>
                </div>
            ))}
            {!sessions.length ? (
                <div className="px-3 py-8 text-center text-sm" style={{ color: theme.node.muted }}>
                    网站 Agent 的对话记录会显示在这里
                </div>
            ) : null}
        </div>
    );
}

function OnlineAgentSetupView({ theme, activeModel, onOpenConfig }: { theme: (typeof canvasThemes)[keyof typeof canvasThemes]; activeModel: string; onOpenConfig: () => void }) {
    return (
        <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
                <div>
                    <div className="text-base font-semibold leading-6">连接配置</div>
                    <div className="mt-1 text-xs leading-5" style={{ color: theme.node.muted }}>
                        网站 Agent 直接使用当前网页配置的文本模型和 API。
                    </div>
                </div>
                <div className="rounded-lg border p-3" style={{ borderColor: theme.node.stroke }}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium leading-5">文本模型</div>
                            <div className="mt-1 truncate text-xs leading-5" style={{ color: theme.node.muted }}>
                                {activeModel || "未配置模型"}
                            </div>
                        </div>
                        <Button className="!h-8 !px-3" type="primary" icon={<Settings2 className="size-4" />} onClick={onOpenConfig}>
                            配置
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function OnlineAgentLogView({ logs, theme, context, onClear }: { logs: OnlineAgentLog[]; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; context: OnlineAgentLogContext; onClear: () => void }) {
    const [mode, setMode] = useState<"text" | "json">("text");
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const content = mode === "text" ? formatOnlineLogText(logs, context) : formatOnlineLogJson(logs, context);
    const lastError = [...logs].reverse().find((item) => /错误|失败|error/i.test(`${item.title}\n${stringifyLog(item.data)}`));
    const copy = async (value = content) => {
        if (await copyToClipboard(value)) return;
        textareaRef.current?.focus();
        textareaRef.current?.select();
    };
    return (
        <div className="flex min-h-full flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Segmented
                    size="small"
                    value={mode}
                    onChange={(value) => setMode(value as "text" | "json")}
                    options={[
                        { label: "排查日志", value: "text" },
                        { label: "原始 JSON", value: "json" },
                    ]}
                />
                <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: theme.node.muted }}>
                        {logs.length} 条
                    </span>
                    <Button size="small" icon={<Copy className="size-3.5" />} disabled={!logs.length} onClick={() => void copy()}>
                        复制
                    </Button>
                    <Button size="small" disabled={!lastError} onClick={() => lastError && void copy(formatOnlineLogText([lastError], context))}>
                        最近错误
                    </Button>
                    <Button size="small" danger type="text" icon={<Trash2 className="size-3.5" />} disabled={!logs.length} onClick={onClear}>
                        清空
                    </Button>
                </div>
            </div>
            <textarea
                ref={textareaRef}
                readOnly
                value={content}
                className="thin-scrollbar min-h-[360px] flex-1 resize-none rounded-lg border bg-transparent p-3 font-mono text-xs leading-5 outline-none"
                style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                onFocus={(event) => event.currentTarget.select()}
            />
        </div>
    );
}

function MessageReferences({ message }: { message: CanvasAssistantMessage }) {
    return (
        <div className={`flex max-w-[88%] flex-wrap gap-2 ${message.role === "user" ? "ml-auto justify-end" : "ml-11 justify-start"}`}>
            {message.references?.map((item, index, references) => (
                <AssistantReferenceChip key={item.id} item={item} label={assistantImageReferenceLabel(references, index)} />
            ))}
        </div>
    );
}

function AssistantReferenceChip({ item, label, onRemove }: { item: CanvasAssistantReference; label?: string; onRemove?: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const text = (item.text || item.title).replace(/\s+/g, " ").trim().slice(0, 1) || "文";
    return (
        <div className="group/chip relative inline-flex h-8 max-w-[150px] shrink-0 items-center gap-1.5 rounded-lg text-sm" style={{ color: theme.node.text }}>
            {item.type === CanvasNodeType.Video ? (
                <span className="grid size-8 shrink-0 place-items-center rounded-lg border" style={{ background: theme.node.panel, borderColor: theme.node.activeStroke }}>
                    <Video className="size-4" />
                </span>
            ) : item.dataUrl ? (
                <span className="relative block size-8 shrink-0">
                    <img src={item.dataUrl} alt="" className="size-8 rounded-lg object-cover" />
                    {label ? <span className="absolute left-0.5 top-0.5 rounded bg-black/60 px-1 py-0.5 text-[8px] font-medium leading-none text-white">{label}</span> : null}
                </span>
            ) : (
                <span className="grid size-8 place-items-center rounded-lg border text-sm font-medium" style={{ background: theme.node.panel, borderColor: theme.node.activeStroke }}>
                    {text}
                </span>
            )}
            {onRemove ? (
                <button
                    type="button"
                    className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border opacity-0 shadow-sm transition group-hover/chip:opacity-100"
                    style={{ background: theme.toolbar.panel, borderColor: theme.node.stroke }}
                    onClick={onRemove}
                    aria-label="移除引用"
                >
                    <X className="size-3" />
                </button>
            ) : null}
        </div>
    );
}

function assistantImageReferenceLabel(references: CanvasAssistantReference[], index: number) {
    if (!references[index]?.dataUrl) return undefined;
    const imageIndex = references.slice(0, index + 1).filter((item) => item.dataUrl).length - 1;
    return imageIndex >= 0 ? imageReferenceLabel(imageIndex) : undefined;
}

function assistantMessageToChatMessage(message: CanvasAssistantMessage): CanvasAgentChatMessage {
    return { id: message.id, role: message.role, title: message.title, text: message.text, meta: message.meta, detail: message.detail };
}

function formatSessionTime(value?: string) {
    return value ? new Date(value).toLocaleString() : "";
}

function sessionPreview(session: CanvasAssistantSession) {
    return session.messages.at(-1)?.text || `${session.messages.length} 条消息`;
}

function objectDetail(value: unknown) {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function stringifyLog(value: unknown) {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function formatOnlineLogText(logs: OnlineAgentLog[], context: OnlineAgentLogContext) {
    const head = [
        "Infinite Canvas 网站 Agent 诊断日志",
        `model: ${context.model || "none"}`,
        `running: ${context.running}`,
        `confirmTools: ${context.confirmTools}`,
        `messages: ${context.messages}`,
        `nodes: ${context.nodes}`,
        `connections: ${context.connections}`,
        `logs: ${logs.length}`,
    ].join("\n");
    const body = logs.map((log, index) => [`#${index + 1} ${log.time} ${log.title}`, log.data === undefined ? "" : stringifyLog(log.data)].filter(Boolean).join("\n")).join("\n\n---\n\n");
    return [head, body || "暂无事件日志"].join("\n\n");
}

function formatOnlineLogJson(logs: OnlineAgentLog[], context: OnlineAgentLogContext) {
    return JSON.stringify({ context, logs: logs.map(({ time, title, data }) => ({ time, title, data })) }, null, 2);
}

function describeCanvasSnapshot(snapshot: CanvasAgentSnapshot) {
    const counts = snapshot.nodes.reduce<Record<string, number>>((acc, node) => {
        acc[node.type] = (acc[node.type] || 0) + 1;
        return acc;
    }, {});
    return `当前画布有 ${snapshot.nodes.length} 个节点、${snapshot.connections.length} 条连线。文本 ${counts[CanvasNodeType.Text] || 0} 个，图片 ${counts[CanvasNodeType.Image] || 0} 个，ComfyUI ${counts[CanvasNodeType.ComfyUI] || 0} 个，视频 ${counts[CanvasNodeType.Video] || 0} 个，音频 ${counts[CanvasNodeType.Audio] || 0} 个。`;
}

function parseToolArguments(value: string) {
    try {
        const parsed = JSON.parse(value || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("工具参数必须是 JSON 对象");
        return parsed as Record<string, unknown>;
    } catch {
        throw new Error("工具参数不是合法 JSON 对象");
    }
}

function onlineToolToOps(name: string, input: Record<string, unknown>, snapshot: CanvasAgentSnapshot, config: AiConfig): CanvasAgentOp[] {
    if (name === "canvas_apply_ops") return requireOps(input.ops);
    if (name === "canvas_create_node") {
        const nodeType = requireNodeType(input.nodeType);
        // 未显式指定坐标时不传 position，由画布按当前节点自动流式避让，避免按 Agent 快照计算导致重叠
        return [{ type: "add_node", nodeType, title: stringOptional(input.title), x: numberOptional(input.x), y: numberOptional(input.y), width: numberOptional(input.width), height: numberOptional(input.height), metadata: recordOptional(input.metadata) as CanvasNodeData["metadata"] }];
    }
    if (name === "canvas_create_text_node") return [textNodeOp(input, numberOptional(input.x), numberOptional(input.y))];
    if (name === "canvas_create_text_nodes") {
        const items = requireRecordArray(input.items, "items");
        const x = numberOr(input.x, nextCanvasX(snapshot));
        const y = numberOr(input.y, 0);
        const gap = numberOr(input.gap, 40);
        const direction = input.direction === "row" ? "row" : "column";
        return items.map((item, index) =>
            textNodeOp(
                { ...item, text: requireString(item.text, "text") },
                numberOr(item.x, direction === "row" ? x + index * (NODE_DEFAULT_SIZE[CanvasNodeType.Text].width + gap) : x),
                numberOr(item.y, direction === "row" ? y : y + index * (NODE_DEFAULT_SIZE[CanvasNodeType.Text].height + gap)),
            ),
        );
    }
    if (name === "canvas_create_image_prompt_flow") return generationFlowOps({ ...input, mode: "image" }, snapshot, config);
    if (name === "canvas_create_generation_flow") return generationFlowOps(input, snapshot, config);
    if (name === "canvas_generate_text") return generationFlowOps({ ...input, mode: "text", autoRun: true }, snapshot, config);
    if (name === "canvas_generate_image") return generationFlowOps({ ...input, mode: "image", autoRun: true }, snapshot, config);
    if (name === "canvas_generate_video") return generationFlowOps({ ...input, mode: "video", autoRun: true }, snapshot, config);
    if (name === "canvas_generate_audio") return generationFlowOps({ ...input, mode: "audio", autoRun: true }, snapshot, config);
    if (name === "canvas_update_node") return [{ type: "update_node", id: requireString(input.id, "id"), patch: recordOptional(input.patch) as Partial<CanvasNodeData> | undefined, metadata: recordOptional(input.metadata) as CanvasNodeData["metadata"] }];
    if (name === "canvas_update_node_text")
        return [{ type: "update_node", id: requireString(input.id, "id"), patch: stringOptional(input.title) ? { title: stringOptional(input.title) } : undefined, metadata: { content: requireString(input.text, "text"), status: "success" } }];
    if (name === "canvas_move_nodes") {
        return requireRecordArray(input.items, "items").map((item) => {
            const id = requireString(item.id, "id");
            const current = snapshot.nodes.find((node) => node.id === id);
            return { type: "update_node", id, patch: { position: { x: numberOr(item.x, (current?.position.x || 0) + numberOr(item.dx, 0)), y: numberOr(item.y, (current?.position.y || 0) + numberOr(item.dy, 0)) } } };
        });
    }
    if (name === "canvas_resize_node")
        return [
            {
                type: "update_node",
                id: requireString(input.id, "id"),
                patch: { width: requireNumber(input.width, "width"), height: requireNumber(input.height, "height") },
                metadata: typeof input.freeResize === "boolean" ? { freeResize: input.freeResize } : undefined,
            },
        ];
    if (name === "canvas_delete_nodes") return [{ type: "delete_node", ids: requireStringArray(input.ids, "ids") }];
    if (name === "canvas_connect_nodes")
        return requireRecordArray(input.connections, "connections").map((connection) => ({ type: "connect_nodes", fromNodeId: requireString(connection.fromNodeId, "fromNodeId"), toNodeId: requireString(connection.toNodeId, "toNodeId") }));
    if (name === "canvas_select_nodes") return [{ type: "select_nodes", ids: requireStringArray(input.ids, "ids") }];
    if (name === "canvas_set_viewport") return [{ type: "set_viewport", viewport: requireViewport(input.viewport) }];
    if (name === "canvas_run_generation") return [runGenerationOp(requireString(input.nodeId, "nodeId"), generationMode(input.mode), stringOptional(input.prompt))];
    if (name === "canvas_retry_node") return [{ type: "retry_node", id: requireString(input.id, "id") }];
    if (name === "canvas_execute_group") return [{ type: "execute_group", id: requireString(input.id, "id") }];
    if (name === "canvas_group_nodes") return [{ type: "group_nodes", ids: requireStringArray(input.ids, "ids"), variant: input.variant === "storyboard" ? "storyboard" : "normal" }];
    if (name === "canvas_ungroup_nodes") return [{ type: "ungroup_nodes", ids: requireStringArray(input.ids, "ids") }];
    if (name === "canvas_image_edit")
        return [{ type: "image_edit", id: requireString(input.id, "id"), action: requireString(input.action, "action") as "angle" | "outpaint" | "lighting" | "cutout" | "panorama720", params: recordOptional(input.params) }];
    if (name === "canvas_image_quick_command") return [{ type: "image_quick_command", id: requireString(input.id, "id"), commandId: requireString(input.commandId, "commandId") }];
    if (name === "canvas_image_process")
        return [{ type: "image_process", id: requireString(input.id, "id"), action: requireString(input.action, "action") as "crop" | "split" | "upscale", params: recordOptional(input.params) }];
    if (name === "canvas_grid_storyboard")
        return [{ type: "grid_storyboard", id: requireString(input.id, "id"), commandId: requireString(input.commandId, "commandId") as "four-grid" | "nine-grid" | "twentyfive-grid" }];
    if (name === "canvas_video_analyze") return [{ type: "video_analyze", id: requireString(input.id, "id") }];
    if (name === "canvas_video_trim") return [{ type: "video_trim", id: requireString(input.id, "id"), start: requireNumber(input.start, "start"), end: requireNumber(input.end, "end") }];
    if (name === "canvas_video_compose") {
        const clips = Array.isArray(input.clips)
            ? input.clips.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null).map((item) => ({
                  nodeId: requireString(item.nodeId, "clips.nodeId"),
                  start: numberOptional(item.start),
                  end: numberOptional(item.end),
              }))
            : undefined;
        return [{ type: "video_compose", id: requireString(input.id, "id"), clips }];
    }
    if (name === "canvas_save_template") return [{ type: "save_template", ids: requireStringArray(input.ids, "ids"), name: requireString(input.name, "name") }];
    if (name === "canvas_insert_template") return [{ type: "insert_template", templateId: stringOptional(input.templateId), name: stringOptional(input.name) }];
    throw new Error(`不支持的工具：${name}`);
}

function generationFlowOps(input: Record<string, unknown>, snapshot: CanvasAgentSnapshot, config: AiConfig): CanvasAgentOp[] {
    const mode = generationMode(input.mode);
    const prompt = requireString(input.prompt, "prompt");
    const x = numberOr(input.x, nextCanvasX(snapshot));
    const y = numberOr(input.y, 0);
    const textId = `text-${nanoid()}`;
    const targetId = `${mode}-${nanoid()}`;
    const referenceNodeIds = Array.isArray(input.referenceNodeIds) ? input.referenceNodeIds.filter((id): id is string => typeof id === "string") : [];
    const tokens = [`@[node:${textId}]`, ...referenceNodeIds.map((id) => `@[node:${id}]`)];
    return [
        textNodeOp({ id: textId, text: prompt }, x, y),
        generationTargetNodeOp(targetId, input, mode, tokens.join("\n"), x + NODE_DEFAULT_SIZE[CanvasNodeType.Text].width + 80, y, config),
        { type: "connect_nodes", fromNodeId: textId, toNodeId: targetId },
        ...referenceNodeIds.map((fromNodeId) => ({ type: "connect_nodes" as const, fromNodeId, toNodeId: targetId })),
        { type: "select_nodes", ids: [targetId] },
        ...(input.autoRun ? [runGenerationOp(targetId, mode, tokens.join("\n"))] : []),
    ];
}

function textNodeOp(input: Record<string, unknown>, x: number | undefined, y: number | undefined): CanvasAgentOp {
    return {
        type: "add_node",
        id: stringOptional(input.id),
        nodeType: CanvasNodeType.Text,
        title: stringOptional(input.title),
        ...(x == null && y == null ? {} : { position: { x: x ?? 0, y: y ?? 0 } }),
        width: numberOptional(input.width),
        height: numberOptional(input.height),
        metadata: { content: stringOptional(input.text), status: "success", fontSize: 14 },
    };
}

function generationTargetNodeOp(id: string, input: Record<string, unknown>, mode: "text" | "image" | "video" | "audio", prompt: string, x: number, y: number, config: AiConfig): CanvasAgentOp {
    return {
        type: "add_node",
        id,
        nodeType: generationNodeType(mode),
        title: stringOptional(input.title),
        position: { x, y },
        width: numberOptional(input.width),
        height: numberOptional(input.height),
        metadata: cleanRecord({
            generationMode: mode,
            composerContent: prompt,
            prompt,
            status: "idle",
            model: resolveGenerationModel(config, mode, stringOptional(input.model)),
            size: stringOptional(input.size) || config.size,
            quality: stringOptional(input.quality) || config.quality,
            count: numberOptional(input.count) ?? generationCount(mode === "image" ? config.canvasImageCount || config.count : config.count),
            seconds: stringOptional(input.seconds) || config.videoSeconds,
            vquality: stringOptional(input.vquality) || config.vquality,
            generateAudio: stringOptional(input.generateAudio) || config.videoGenerateAudio,
            watermark: stringOptional(input.watermark) || config.videoWatermark,
            audioVoice: stringOptional(input.audioVoice) || config.audioVoice,
            audioFormat: stringOptional(input.audioFormat) || config.audioFormat,
            audioSpeed: stringOptional(input.audioSpeed) || config.audioSpeed,
            audioInstructions: stringOptional(input.audioInstructions) || config.audioInstructions,
        }) as CanvasNodeData["metadata"],
    };
}

function runGenerationOp(nodeId: string, mode: "text" | "image" | "video" | "audio", prompt?: string): CanvasAgentOp {
    return { type: "run_generation", nodeId, mode, prompt };
}

function isWritableToolCall(call: ResponseToolCall) {
    return !ONLINE_READ_TOOLS.has(call.function.name);
}

function requiresOnlineApproval(calls: ResponseToolCall[], confirmTools: boolean) {
    return confirmTools || calls.some((call) => HIGH_COST_ONLINE_TOOL_NAMES.has(call.function.name));
}

function buildToolImpact(calls: ResponseToolCall[], snapshot: CanvasAgentSnapshot) {
    return {
        canvasTitle: snapshot.title || "未命名画布",
        operationCount: calls.length,
        selectedCount: snapshot.selectedNodeIds.length,
        nodeCount: snapshot.nodes.length,
        connectionCount: snapshot.connections.length,
        labels: Array.from(new Set(calls.map((call) => toolCallLabel(call.function.name)))),
    };
}

function toolCallsFromDetail(detail: Record<string, unknown>): ResponseToolCall[] {
    return Array.isArray(detail.toolCalls) ? (detail.toolCalls.filter(isResponseToolCall) as ResponseToolCall[]) : [];
}

function isResponseToolCall(value: unknown): value is ResponseToolCall {
    const item = objectDetail(value);
    const fn = objectDetail(item.function);
    return typeof item.id === "string" && item.type === "function" && typeof fn.name === "string" && typeof fn.arguments === "string";
}

function toolCallToResponseInput(call: ResponseToolCall, reasoningContent?: string): ResponseInputMessage {
    return { type: "function_call", call_id: call.id, name: call.function.name, arguments: call.function.arguments, ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {}), ...(reasoningContent ? { reasoningContent } : {}) };
}

function summarizeToolCalls(calls: ResponseToolCall[]) {
    return calls.map((call) => toolCallLabel(call.function.name)).join("，") || "工具调用";
}

function toolCallLabel(name: string) {
    if (name === "canvas_apply_ops") return "画布操作";
    if (name === "canvas_get_state") return "读取画布";
    if (name === "canvas_get_selection") return "读取选区";
    if (name === "canvas_export_snapshot") return "导出快照";
    if (name === "canvas_create_node") return "创建节点";
    if (name === "canvas_create_text_node") return "创建文本";
    if (name === "canvas_create_text_nodes") return "批量创建文本";
    if (name === "canvas_create_image_prompt_flow") return "创建生图流程";
    if (name === "canvas_create_generation_flow") return "创建生成流程";
    if (name === "canvas_generate_text") return "生成文本";
    if (name === "canvas_generate_image") return "生成图片";
    if (name === "canvas_generate_video") return "生成视频";
    if (name === "canvas_generate_audio") return "生成音频";
    if (name === "canvas_update_node") return "更新节点";
    if (name === "canvas_update_node_text") return "更新文本";
    if (name === "canvas_move_nodes") return "移动节点";
    if (name === "canvas_resize_node") return "调整节点尺寸";
    if (name === "canvas_delete_nodes") return "删除节点";
    if (name === "canvas_connect_nodes") return "连接节点";
    if (name === "canvas_select_nodes") return "选择节点";
    if (name === "canvas_set_viewport") return "调整视口";
    if (name === "canvas_run_generation") return "触发生成";
    if (name === "canvas_list_templates") return "查询模板";
    if (name === "canvas_retry_node") return "重跑节点";
    if (name === "canvas_execute_group") return "整组执行";
    if (name === "canvas_group_nodes") return "打组";
    if (name === "canvas_ungroup_nodes") return "解组";
    if (name === "canvas_image_edit") return "图像编辑";
    if (name === "canvas_image_quick_command") return "快捷功能";
    if (name === "canvas_image_process") return "图像处理";
    if (name === "canvas_grid_storyboard") return "宫格分镜";
    if (name === "canvas_video_analyze") return "视频解析";
    if (name === "canvas_video_trim") return "视频剪辑";
    if (name === "canvas_video_compose") return "视频合成";
    if (name === "canvas_save_template") return "保存模板";
    if (name === "canvas_insert_template") return "插入模板";
    return name;
}

function toolResultText(result: OnlineToolResult) {
    return result.message;
}

function requireStringArray(value: unknown, field: string): string[] {
    if (!Array.isArray(value)) throw new Error(`${field} 必须是字符串数组`);
    if (!value.every((item) => typeof item === "string" && Boolean(item))) throw new Error(`${field} 必须只包含非空字符串`);
    return value as string[];
}

function requireOps(value: unknown): CanvasAgentOp[] {
    if (!Array.isArray(value)) throw new Error("ops 必须是数组");
    return value.map(toCanvasAgentOp);
}

function toCanvasAgentOp(value: unknown): CanvasAgentOp {
    const item = objectDetail(value);
    const type = item.type;
    if (type === "add_node") {
        return {
            type,
            id: stringOptional(item.id),
            nodeType: item.nodeType ? requireNodeType(item.nodeType) : undefined,
            title: stringOptional(item.title),
            position: recordOptional(item.position) ? { x: requireNumber(objectDetail(item.position).x, "position.x"), y: requireNumber(objectDetail(item.position).y, "position.y") } : undefined,
            x: numberOptional(item.x),
            y: numberOptional(item.y),
            width: numberOptional(item.width),
            height: numberOptional(item.height),
            metadata: recordOptional(item.metadata) as CanvasNodeData["metadata"],
        };
    }
    if (type === "update_node") return { type, id: requireString(item.id, "id"), patch: recordOptional(item.patch) as Partial<CanvasNodeData> | undefined, metadata: recordOptional(item.metadata) as CanvasNodeData["metadata"] };
    if (type === "delete_node") return { type, id: stringOptional(item.id), ids: Array.isArray(item.ids) ? requireStringArray(item.ids, "ids") : undefined, nodeType: item.nodeType ? requireNodeType(item.nodeType) : undefined };
    if (type === "delete_connections") return { type, id: stringOptional(item.id), ids: Array.isArray(item.ids) ? requireStringArray(item.ids, "ids") : undefined, all: typeof item.all === "boolean" ? item.all : undefined };
    if (type === "connect_nodes") return { type, id: stringOptional(item.id), fromNodeId: requireString(item.fromNodeId, "fromNodeId"), toNodeId: requireString(item.toNodeId, "toNodeId") };
    if (type === "set_viewport") return { type, viewport: requireViewport(item.viewport) };
    if (type === "select_nodes") return { type, ids: requireStringArray(item.ids, "ids") };
    if (type === "run_generation") return { type, nodeId: requireString(item.nodeId, "nodeId"), mode: generationMode(item.mode), prompt: stringOptional(item.prompt) };
    if (type === "retry_node") return { type, id: requireString(item.id, "id") };
    if (type === "execute_group") return { type, id: requireString(item.id, "id") };
    if (type === "group_nodes") return { type, ids: requireStringArray(item.ids, "ids"), variant: item.variant === "storyboard" ? "storyboard" : "normal" };
    if (type === "ungroup_nodes") return { type, ids: requireStringArray(item.ids, "ids") };
    if (type === "image_edit") return { type, id: requireString(item.id, "id"), action: requireString(item.action, "action") as "angle" | "outpaint" | "lighting" | "cutout" | "panorama720", params: recordOptional(item.params) };
    if (type === "image_quick_command") return { type, id: requireString(item.id, "id"), commandId: requireString(item.commandId, "commandId") };
    if (type === "image_process") return { type, id: requireString(item.id, "id"), action: requireString(item.action, "action") as "crop" | "split" | "upscale", params: recordOptional(item.params) };
    if (type === "grid_storyboard") return { type, id: requireString(item.id, "id"), commandId: requireString(item.commandId, "commandId") as "four-grid" | "nine-grid" | "twentyfive-grid" };
    if (type === "video_analyze") return { type, id: requireString(item.id, "id") };
    if (type === "video_trim") return { type, id: requireString(item.id, "id"), start: requireNumber(item.start, "start"), end: requireNumber(item.end, "end") };
    if (type === "video_compose") {
        const clips = Array.isArray(item.clips)
            ? requireRecordArray(item.clips, "clips").map((clip) => ({ nodeId: requireString(clip.nodeId, "clips.nodeId"), start: numberOptional(clip.start), end: numberOptional(clip.end) }))
            : undefined;
        return { type, id: requireString(item.id, "id"), clips };
    }
    if (type === "save_template") return { type, ids: requireStringArray(item.ids, "ids"), name: requireString(item.name, "name") };
    if (type === "insert_template") return { type, templateId: stringOptional(item.templateId), name: stringOptional(item.name) };
    throw new Error("不支持的画布操作类型");
}

function requireRecordArray(value: unknown, field: string): Record<string, unknown>[] {
    if (!Array.isArray(value)) throw new Error(`${field} 必须是数组`);
    return value.map((item) => {
        const record = objectDetail(item);
        if (!Object.keys(record).length) throw new Error(`${field} 必须只包含对象`);
        return record;
    });
}

function requireString(value: unknown, field: string) {
    if (typeof value !== "string" || !value) throw new Error(`${field} 必须是非空字符串`);
    return value;
}

function requireNumber(value: unknown, field: string) {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${field} 必须是数字`);
    return value;
}

function requireNodeType(value: unknown): CanvasNodeType {
    if (value === CanvasNodeType.Text || value === CanvasNodeType.Image || value === CanvasNodeType.ComfyUI || value === CanvasNodeType.Video || value === CanvasNodeType.Audio) return value;
    throw new Error("节点类型必须是 text、image、comfyui、video 或 audio");
}

function requireViewport(value: unknown) {
    const item = objectDetail(value);
    return { x: requireNumber(item.x, "viewport.x"), y: requireNumber(item.y, "viewport.y"), k: requireNumber(item.k, "viewport.k") };
}

function recordOptional(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function stringOptional(value: unknown) {
    return typeof value === "string" ? value : "";
}

function numberOptional(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function numberOr(value: unknown, fallback: number) {
    return numberOptional(value) ?? fallback;
}

function nextCanvasX(snapshot: CanvasAgentSnapshot) {
    return snapshot.nodes.length ? Math.max(...snapshot.nodes.map((node) => node.position.x + node.width)) + 80 : 0;
}

function generationMode(value: unknown): "text" | "image" | "video" | "audio" {
    return value === "text" || value === "video" || value === "audio" ? value : "image";
}

function generationNodeType(mode: "text" | "image" | "video" | "audio") {
    if (mode === "text") return CanvasNodeType.Text;
    if (mode === "video") return CanvasNodeType.Video;
    if (mode === "audio") return CanvasNodeType.Audio;
    return CanvasNodeType.Image;
}

function defaultGenerationModel(config: AiConfig, mode: "text" | "image" | "video" | "audio") {
    if (mode === "image") return config.imageModel || config.model;
    if (mode === "video") return config.videoModel || config.model;
    if (mode === "audio") return config.audioModel || config.model;
    return config.textModel || config.model;
}

function resolveGenerationModel(config: AiConfig, mode: "text" | "image" | "video" | "audio", model?: string) {
    const normalized = normalizeModelOptionValue(model, config.channels);
    return normalized && selectableModelsByCapability(config, mode).includes(normalized) ? normalized : defaultGenerationModel(config, mode);
}

function generationCount(value: string) {
    return Math.max(1, Math.min(15, Math.floor(Math.abs(Number(value)) || 1)));
}

function cleanRecord(value: Record<string, unknown>) {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ""));
}

function snapshotSignature(snapshot: CanvasAgentSnapshot) {
    return JSON.stringify({ nodes: snapshot.nodes, connections: snapshot.connections, selectedNodeIds: snapshot.selectedNodeIds, viewport: snapshot.viewport });
}

function explainNoop(ops: CanvasAgentOp[], snapshot: CanvasAgentSnapshot) {
    if (!ops.length) return "模型没有返回可执行的画布操作。";
    const nodeIds = new Set(snapshot.nodes.map((node) => node.id));
    const connectionIds = new Set(snapshot.connections.map((conn) => conn.id));
    const deleteConnectionOps = ops.filter((op): op is Extract<CanvasAgentOp, { type: "delete_connections" }> => op.type === "delete_connections");
    const connectOps = ops.filter((op): op is Extract<CanvasAgentOp, { type: "connect_nodes" }> => op.type === "connect_nodes");
    const deleteNodeOps = ops.filter((op): op is Extract<CanvasAgentOp, { type: "delete_node" }> => op.type === "delete_node");
    const updateOps = ops.filter((op): op is Extract<CanvasAgentOp, { type: "update_node" }> => op.type === "update_node");
    const selectOps = ops.filter((op): op is Extract<CanvasAgentOp, { type: "select_nodes" }> => op.type === "select_nodes");
    const generationOps = ops.filter((op): op is Extract<CanvasAgentOp, { type: "run_generation" }> => op.type === "run_generation");
    if (deleteConnectionOps.length && !snapshot.connections.length) return "画布当前没有连线可删除。";
    if (deleteConnectionOps.length && deleteConnectionOps.every((op) => !op.all && [...(op.ids || []), ...(op.id ? [op.id] : [])].every((id) => !connectionIds.has(id)))) return "没有找到要删除的连线。";
    if (connectOps.length && connectOps.every((op) => snapshot.connections.some((conn) => conn.fromNodeId === op.fromNodeId && conn.toNodeId === op.toNodeId))) return "这些节点已经存在对应连线，无需重复连接。";
    if (connectOps.length && connectOps.every((op) => !nodeIds.has(op.fromNodeId) || !nodeIds.has(op.toNodeId))) return "没有找到要连接的节点。";
    if (deleteNodeOps.length && deleteNodeOps.every((op) => op.nodeType === CanvasNodeType.ComfyUI) && !snapshot.nodes.some((node) => node.type === CanvasNodeType.ComfyUI)) return "画布当前没有 ComfyUI 节点可删除。";
    if (deleteNodeOps.length && deleteNodeOps.every((op) => [...(op.ids || []), ...(op.id ? [op.id] : [])].every((id) => !nodeIds.has(id)))) return "没有找到要删除的节点。";
    if (updateOps.length && updateOps.every((op) => !nodeIds.has(op.id))) return "没有找到要更新的节点。";
    if (selectOps.length && selectOps.every((op) => !(op.ids || []).some((id) => nodeIds.has(id)))) return "没有找到要选择的节点。";
    if (generationOps.length && generationOps.every((op) => !nodeIds.has(op.nodeId))) return "没有找到要触发生成的节点。";
    if (ops.every((op) => op.type === "set_viewport")) return "视图已经是目标状态。";
    if (selectOps.length && selectOps.every((op) => JSON.stringify(op.ids || []) === JSON.stringify(snapshot.selectedNodeIds))) return "选区已经是目标状态。";
    return "工具已执行，但画布状态没有变化；请在日志 tab 查看工具参数和执行前后状态。";
}

function nodeToReference(node: CanvasNodeData): CanvasAssistantReference | null {
    if (node.type === CanvasNodeType.Image && node.metadata?.content) {
        return { id: node.id, type: node.type, title: node.title, dataUrl: node.metadata.content, storageKey: node.metadata.storageKey };
    }
    if (node.type === CanvasNodeType.Text && node.metadata?.content) {
        return { id: node.id, type: node.type, title: node.title, text: node.metadata.content };
    }
    if (node.type === CanvasNodeType.Video && (node.metadata?.content || node.metadata?.storageKey)) {
        return {
            id: node.id,
            type: node.type,
            title: node.title,
            mediaUrl: node.metadata.content,
            storageKey: node.metadata.storageKey,
            mimeType: node.metadata.mimeType,
        };
    }
    return null;
}

function buildAssistantReferences(nodes: CanvasNodeData[], selectedNodeIds: Set<string>) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    return Array.from(selectedNodeIds)
        .map((id) => nodeById.get(id))
        .filter((node): node is CanvasNodeData => Boolean(node))
        .map(nodeToReference)
        .filter((item): item is CanvasAssistantReference => Boolean(item));
}

function mergeAssistantReferences(base: CanvasAssistantReference[], extra: CanvasAssistantReference[]) {
    const seen = new Set(base.map((item) => item.id));
    return [...base, ...extra.filter((item) => !seen.has(item.id))];
}

async function buildOnlineSystemPrompt(artSkill?: string, storySkill?: string, directorSkill?: string): Promise<string> {
    const parts = [ONLINE_AGENT_PROMPT];
    if (storySkill) {
        const content = await loadStorySkill(storySkill);
        if (content) parts.push(content);
    }
    if (artSkill) {
        const content = await loadArtSkill(artSkill);
        if (content) parts.push(content);
    }
    if (directorSkill) {
        const content = await loadDirectorSkill(directorSkill);
        if (content) parts.push(content);
    }
    if (artSkill || storySkill || directorSkill) {
        parts.push("生成图片或视频时，必须严格按上述风格与导演约束组织提示词，不得偏离风格定义。");
    }
    return parts.join("\n\n---\n\n");
}

async function buildToolAgentMessages(snapshot: CanvasAgentSnapshot, history: CanvasAssistantMessage[], userMessage: CanvasAssistantMessage, options?: { artSkill?: string; storySkill?: string; directorSkill?: string }): Promise<ResponseInputMessage[]> {
    const refs = userMessage.references || [];
    const videoFrames = await Promise.all(refs.filter((item) => item.type === CanvasNodeType.Video).map(videoReferenceToFrames));
    return [
        { role: "system", content: await buildOnlineSystemPrompt(options?.artSkill, options?.storySkill, options?.directorSkill) },
        ...history
            .filter((message): message is CanvasAssistantMessage & { role: "user" | "assistant" | "system" } => message.role === "user" || message.role === "assistant" || message.role === "system")
            .slice(-8)
            .map((message): ResponseInputMessage => ({ role: message.role, content: message.text, ...(message.role === "assistant" && message.reasoningContent ? { reasoningContent: message.reasoningContent } : {}) })),
        {
            role: "user",
            content: [
                ...refs.flatMap((item) => (item.text ? [{ type: "text" as const, text: `选中节点 ${item.title}：${item.text}` }] : [])),
                ...videoFrames.flatMap(({ title, frames, error }) => [
                    { type: "text" as const, text: error ? `视频节点 ${title} 无法读取：${error}` : `视频节点 ${title} 已按时间顺序抽取 ${frames.length} 帧，请结合这些画面理解视频内容。` },
                    ...frames.map((url) => ({ type: "image_url" as const, image_url: { url } })),
                ]),
                { type: "text", text: `当前画布：${JSON.stringify(compactSnapshot(snapshot))}\n\n用户需求：${userMessage.text}` },
                ...(await Promise.all(refs.filter((item) => item.dataUrl).map(async (item) => ({ type: "image_url" as const, image_url: { url: await imageToDataUrl(item) } })))),
            ],
        },
    ];
}

async function videoReferenceToFrames(reference: CanvasAssistantReference) {
    let objectUrl = "";
    const video = document.createElement("video");
    try {
        const blob = reference.storageKey ? await getMediaBlob(reference.storageKey) : null;
        objectUrl = blob ? URL.createObjectURL(blob) : "";
        const source = objectUrl || reference.mediaUrl;
        if (!source) throw new Error("视频文件已不可用");
        video.preload = "auto";
        video.muted = true;
        video.playsInline = true;
        video.src = source;
        await waitForAssistantVideoEvent(video, "loadedmetadata");
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) await waitForAssistantVideoEvent(video, "loadeddata");
        const duration = Number.isFinite(video.duration) ? video.duration : 0;
        const times = Array.from(new Set([Math.min(0.1, Math.max(0, duration - 0.01)), duration / 2, Math.max(0, duration - 0.05)].map((time) => Number(time.toFixed(3)))));
        const frames: string[] = [];
        for (const time of times) {
            if (Math.abs(video.currentTime - time) > 0.001) {
                const seeked = waitForAssistantVideoEvent(video, "seeked");
                video.currentTime = time;
                await seeked;
            }
            await waitForAssistantVideoFrame(video);
            const width = video.videoWidth;
            const height = video.videoHeight;
            if (!width || !height) throw new Error("视频画面尚未解码");
            const scale = Math.min(1, 960 / Math.max(width, height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.round(width * scale));
            canvas.height = Math.max(1, Math.round(height * scale));
            const context = canvas.getContext("2d");
            if (!context) throw new Error("无法创建视频帧画布");
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            frames.push(canvas.toDataURL("image/jpeg", 0.86));
        }
        return { title: reference.title, frames, error: "" };
    } catch (error) {
        return { title: reference.title, frames: [], error: error instanceof Error ? error.message : "视频读取失败" };
    } finally {
        video.removeAttribute("src");
        video.load();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
}

function waitForAssistantVideoEvent(video: HTMLVideoElement, eventName: "loadedmetadata" | "loadeddata" | "seeked") {
    return new Promise<void>((resolve, reject) => {
        const cleanup = () => {
            video.removeEventListener(eventName, onSuccess);
            video.removeEventListener("error", onError);
        };
        const onSuccess = () => {
            cleanup();
            resolve();
        };
        const onError = () => {
            cleanup();
            reject(new Error("视频解码失败"));
        };
        video.addEventListener(eventName, onSuccess, { once: true });
        video.addEventListener("error", onError, { once: true });
    });
}

function waitForAssistantVideoFrame(video: HTMLVideoElement) {
    return new Promise<void>((resolve) => {
        let timeout = 0;
        const finish = () => {
            window.clearTimeout(timeout);
            resolve();
        };
        timeout = window.setTimeout(finish, 800);
        if ("requestVideoFrameCallback" in video) {
            video.requestVideoFrameCallback(() => finish());
            return;
        }
        window.requestAnimationFrame(() => window.requestAnimationFrame(finish));
    });
}

function compactSnapshot(snapshot: CanvasAgentSnapshot) {
    return {
        title: snapshot.title,
        viewport: snapshot.viewport,
        selectedNodeIds: snapshot.selectedNodeIds,
        nodes: snapshot.nodes.map((node) => ({
            id: node.id,
            type: node.type,
            title: node.title,
            position: node.position,
            width: node.width,
            height: node.height,
            metadata: compactMetadata(node.metadata || {}),
        })),
        connections: snapshot.connections,
    };
}

function compactMetadata(metadata: CanvasNodeData["metadata"]) {
    return {
        content: String(metadata?.content || "").slice(0, 500),
        prompt: String(metadata?.prompt || metadata?.composerContent || "").slice(0, 500),
        status: metadata?.status,
        errorDetails: metadata?.errorDetails,
        generationMode: metadata?.generationMode,
        model: metadata?.model,
        size: metadata?.size,
        quality: metadata?.quality,
        count: metadata?.count,
        seconds: metadata?.seconds,
        vquality: metadata?.vquality,
        generateAudio: metadata?.generateAudio,
        audioVoice: metadata?.audioVoice,
        imageStylePreset: metadata?.imageStylePreset,
        videoStylePreset: metadata?.videoStylePreset,
        videoCameraPreset: metadata?.videoCameraPreset,
        videoSubjectId: metadata?.videoSubjectId,
        canvasTool: metadata?.canvasTool,
        isBatchRoot: metadata?.isBatchRoot,
        batchRootId: metadata?.batchRootId,
    };
}

function createSession(): CanvasAssistantSession {
    const now = new Date().toISOString();
    return { id: nanoid(), title: "新对话", messages: [], createdAt: now, updatedAt: now };
}
