import type { VideoGenerationMode } from "@/flowcanvas/services/api/model-capabilities";
import type { DirectorProject } from "./director/storyai/editor/schema/directorProject";

export type Position = {
    x: number;
    y: number;
};

export type ViewportTransform = {
    x: number;
    y: number;
    k: number;
};

export type CanvasAlignmentGuides = {
    vertical?: number;
    horizontal?: number;
};

export enum CanvasNodeType {
    Image = "image",
    Text = "text",
    Config = "config",
    ComfyUI = "comfyui",
    Video = "video",
    Audio = "audio",
    Group = "group",
}

export type CanvasNodeStatus = "idle" | "success" | "loading" | "error";
export type CanvasGenerationMode = "text" | "image" | "video" | "audio" | "comfyui";
export type CanvasImageGenerationType = "generation" | "edit";
export type CanvasGenerationRunStatus = "running" | "succeeded" | "failed" | "cancelled";
export type CanvasGenerationRun = {
    id: string;
    status: CanvasGenerationRunStatus;
    startedAt: number;
    updatedAt: number;
    prompt?: string;
    model?: string;
    mode?: CanvasGenerationMode;
    errorDetails?: string;
};
export type CanvasNodeActionIntent =
    | "text-to-video"
    | "text-to-audio"
    | "image-to-panorama"
    | "script-edit"
    | "script-to-storyboard"
    | "script-to-video"
    | "script-to-audio"
    | "composition-timeline";
export type CanvasBaseMetadata = {
    typeSequence?: number;
    content?: string;
    composerContent?: string;
    canvasTool?: "script" | "videoComposition" | "director" | "panorama360";
    prompt?: string;
    requestPrompt?: string;
    status?: CanvasNodeStatus;
    errorDetails?: string;
    fontSize?: number;
    /** 文本节点选中态工具栏使用的轻量富文本样式。正文仍保持纯文本，便于跨节点引用。 */
    textFormat?: {
        heading?: 1 | 2 | 3;
        quote?: boolean;
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
        strike?: boolean;
        list?: "unordered" | "ordered";
        link?: boolean;
    };
};

export type CanvasScriptBeat = {
    id: string;
    title: string;
    content: string;
    prompt: string;
    /** 镜头景别：远景/全景/中景/近景/特写 等，由脚本正文推断或手动指定 */
    shotType?: string;
    /** 分镜时长（秒），默认 3s */
    duration?: string;
    /** 本镜主要角色（引用资产名，可为空） */
    character?: string;
    /** 本镜场景（引用资产名，可为空） */
    scene?: string;
    /** 机位/运镜，如「中景跟拍」「特写推近」 */
    camera?: string;
    /** 本镜台词/对白，无则空 */
    dialogue?: string;
    /** 所属幕/集（如「第一幕」「第二幕」），未分幕为空 */
    act?: string;
    /** 所属场标题（如「场 1 · A 控制室 · 深夜」），由正文分镜表的场行解析 */
    sceneHeading?: string;
    /** 本镜参考图（画布图片节点 id）。未设置时生成自动带入角色/场景资产设定图；显式空数组表示不用垫图 */
    referenceNodeIds?: string[];
    /** 分镜图提示词覆盖：留空时按画面描述 + 角色/场景资产描述自动合成 */
    imagePrompt?: string;
};

/** 脚本拆解出的可复用资产（角色/场景/道具），生成提示词时引用其描述 */
export type CanvasScriptAsset = {
    id: string;
    kind: "character" | "scene" | "prop";
    name: string;
    description: string;
};

export type CanvasScriptAct = {
    id: string;
    /** 幕标题，如「第一幕」 */
    title: string;
    /** 幕名/主题，如「解读与分裂」 */
    name?: string;
    /** 幕梗概 */
    summary?: string;
    /** 幕时长，如「约 45 分钟」 */
    duration?: string;
};

export type CanvasScriptMetadata = {
    scriptTitle?: string;
    scriptLogline?: string;
    scriptBody?: string;
    scriptBeats?: CanvasScriptBeat[];
    scriptAssets?: CanvasScriptAsset[];
    /** 幕/集结构（分镜按幕分组，一幕一幕制作） */
    scriptActs?: CanvasScriptAct[];
    scriptOutputIds?: string[];
    /** 分镜表「导出」批量创建的节点 id（重复导出时先替换旧节点，避免叠加） */
    scriptExportIds?: string[];
    /** 分镜 id → 输出节点 id（脚本工作台生成状态回显） */
    scriptBeatOutputs?: Record<string, string>;
    /** 分镜 id → 分镜图节点 id（两段式：先出分镜帧图，再图生视频） */
    scriptBeatFrames?: Record<string, string>;
    /** 资产 id → 输出节点 id（资产生成状态回显） */
    scriptAssetOutputs?: Record<string, string>;
};

export type CanvasDirectorMetadata = {
    directorProject?: DirectorProject;
    directorOutputIds?: string[];
};

export type CanvasGenerationMetadata = {
    generationMode?: CanvasGenerationMode;
    generationType?: CanvasImageGenerationType;
    model?: string;
    size?: string;
    quality?: string;
    resolution?: string;
    count?: number;
    seconds?: string;
    vquality?: string;
    generateAudio?: string;
    watermark?: string;
    draft?: string;
    videoGenerationMode?: VideoGenerationMode;
    videoStylePreset?: string;
    videoCameraPreset?: string;
    /** 视频主体库选中的主体 id（账号配置 videoSubjects） */
    videoSubjectId?: string;
    imageStylePreset?: string;
    imageCameraBody?: string;
    imageCameraLens?: string;
    imageCameraFocalLength?: string;
    imageCameraAperture?: string;
    videoTask?: { id: string; provider: "openai" | "agnes"; model: string };
    videoTaskStartedAt?: number;
    /** 视频已在上游生成完成、正在下载文件（下载可能耗时数分钟）。 */
    videoDownloading?: boolean;
    generationJobId?: string;
    generationRuns?: CanvasGenerationRun[];
    audioVoice?: string;
    audioFormat?: string;
    audioSpeed?: string;
    audioInstructions?: string;
    comfyWorkflowId?: string;
    comfyWorkflowValues?: Record<string, unknown>;
    /** ComfyUI 工作流能力：反推提示词 / 文生图 / 参考图生图 / 图生视频 */
    comfyCapability?: "text-to-text" | "image-to-text" | "text-to-image" | "image-to-image" | "text-to-video" | "image-to-video" | "reference-video";
    comfyFieldValues?: Record<string, unknown>;
    references?: string[];
};

export type CanvasBatchMetadata = {
    freeResize?: boolean;
    isBatchRoot?: boolean;
    batchRootId?: string;
    batchChildIds?: string[];
    batchUsesReferenceImages?: boolean;
    primaryImageId?: string;
    imageBatchExpanded?: boolean;
};

export type CanvasGroupMetadata = {
    groupChildIds?: string[];
    groupVariant?: "normal" | "storyboard";
};

export type CanvasMediaMetadata = {
    naturalWidth?: number;
    naturalHeight?: number;
    storageKey?: string;
    mimeType?: string;
    bytes?: number;
    durationMs?: number;
};

/** Agent Run 任务节点标记（agent-run 编译器写入，用于状态跟踪与恢复） */
export type CanvasAgentRunMetadata = {
    agentRunId?: string;
    agentTaskId?: string;
};

export type CanvasNodeMetadata = CanvasBaseMetadata & CanvasScriptMetadata & CanvasDirectorMetadata & CanvasGenerationMetadata & CanvasBatchMetadata & CanvasGroupMetadata & CanvasMediaMetadata & CanvasAgentRunMetadata;

export type CanvasNodeData = {
    id: string;
    type: CanvasNodeType;
    title: string;
    position: Position;
    width: number;
    height: number;
    metadata?: CanvasNodeMetadata;
    /** TapNow: 节点 Pin 颜色标记（右上角色点），值为 canvas-pin-utils 色板内 id。 */
    pinColor?: string;
};

export type CanvasConnection = {
    id: string;
    fromNodeId: string;
    toNodeId: string;
    referenceOrder?: number;
};

export type CanvasAssistantReference = {
    id: string;
    type: CanvasNodeType;
    title: string;
    dataUrl?: string;
    mediaUrl?: string;
    storageKey?: string;
    mimeType?: string;
    text?: string;
};

export type CanvasAssistantImage = {
    id: string;
    dataUrl: string;
    storageKey?: string;
    prompt: string;
    width?: number;
    height?: number;
    bytes?: number;
    mimeType?: string;
};

export type CanvasAssistantMessage = {
    id: string;
    role: "user" | "assistant" | "system" | "tool" | "error";
    title?: string;
    text: string;
    meta?: string;
    detail?: unknown;
    references?: CanvasAssistantReference[];
    /** DeepSeek 等思考模式模型的思考内容，多轮对话需回传。 */
    reasoningContent?: string;
};

export type CanvasAssistantSession = {
    id: string;
    title: string;
    messages: CanvasAssistantMessage[];
    createdAt: string;
    updatedAt: string;
};

export type ConnectionHandle = {
    nodeId: string;
    handleType: "source" | "target";
};

export type ContextMenuState =
    | {
          type: "node";
          x: number;
          y: number;
          nodeId: string;
      }
    | {
          type: "connection";
          x: number;
          y: number;
          connectionId: string;
      }
    | {
          type: "canvas";
          x: number;
          y: number;
          canvasPosition: Position;
      };
