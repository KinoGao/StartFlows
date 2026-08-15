"use client";

import { nanoid } from "nanoid";

import { fetchPublishedWorkflows } from "@/flowcanvas/services/api/platform-admin";

export type ComfyWorkflowFieldType = "text" | "textarea" | "number" | "slider" | "dropdown" | "image" | "video" | "audio" | "boolean";

export type ComfyWorkflowNode = {
    inputs?: Record<string, unknown>;
    class_type?: string;
    _meta?: { title?: string };
};

export type ComfyWorkflowJson = Record<string, ComfyWorkflowNode>;

export type ComfyWorkflowField = {
    id: string;
    node: string;
    input: string;
    name: string;
    type: ComfyWorkflowFieldType;
    default?: unknown;
    min?: number | null;
    max?: number | null;
    step?: number | null;
    options?: string[];
    bindPrompt?: boolean;
    randomEnabled?: boolean;
};

export type ComfyWorkflow = {
    id: string;
    name: string;
    title: string;
    /** 后台配置的工作流能力（空 = 创作端自动识别） */
    capability?: ComfyUiCapability | "";
    workflow: ComfyWorkflowJson;
    fields: ComfyWorkflowField[];
    createdAt: string;
    updatedAt: string;
};

export type ComfyWorkflowInputCandidate = {
    node: string;
    input: string;
    value: unknown;
    field: ComfyWorkflowField;
    nodeTitle: string;
    classType: string;
};

let workflowCache: ComfyWorkflow[] | null = null;
let workflowRequest: Promise<ComfyWorkflow[]> | null = null;

export async function listComfyWorkflows() {
    if (workflowCache) return [...workflowCache];
    if (!workflowRequest) {
        workflowRequest = fetchPublishedWorkflows()
            .then((workflows) => normalizeComfyWorkflows(workflows))
            .then((workflows) => {
                workflowCache = workflows;
                return workflows;
            })
            .finally(() => {
                workflowRequest = null;
            });
    }
    return [...(await workflowRequest)];
}

export async function refreshComfyWorkflows() {
    workflowCache = null;
    workflowRequest = null;
    return listComfyWorkflows();
}

export async function getComfyWorkflow(id: string) {
    const workflows = await listComfyWorkflows();
    return workflows.find((workflow) => workflow.id === id) || null;
}

function normalizeComfyWorkflows(workflows: ComfyWorkflow[]) {
    return workflows.map((workflow) => ({ ...workflow, fields: Array.isArray(workflow.fields) ? workflow.fields : [] }));
}

export function parseComfyWorkflowJson(text: string): ComfyWorkflowJson {
    const parsed = JSON.parse(text) as unknown;
    if (!isComfyWorkflowJson(parsed)) throw new Error("请选择 ComfyUI 导出的 API 格式 workflow JSON");
    return parsed;
}

export function isComfyWorkflowJson(value: unknown): value is ComfyWorkflowJson {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const nodes = Object.values(value);
    return nodes.length > 0 && nodes.every((node) => Boolean(node && typeof node === "object" && !Array.isArray(node) && ("inputs" in node || "class_type" in node)));
}

export function listComfyWorkflowInputCandidates(workflow: ComfyWorkflowJson | null | undefined): ComfyWorkflowInputCandidate[] {
    if (!workflow || typeof workflow !== "object") return [];
    return Object.entries(workflow).flatMap(([nodeId, node]) =>
        Object.entries(node.inputs || {})
            .filter(([, value]) => !isWorkflowLink(value))
            .map(([input, value]) => {
                const field = createFieldFromInput(nodeId, input, value);
                return {
                    node: nodeId,
                    input,
                    value,
                    field,
                    nodeTitle: node._meta?.title || node.class_type || `节点 ${nodeId}`,
                    classType: node.class_type || "",
                };
            }),
    );
}

export function createFieldFromInput(node: string, input: string, value: unknown): ComfyWorkflowField {
    const type = guessFieldType(input, value);
    const field: ComfyWorkflowField = {
        id: `f_${nanoid(8)}`,
        node,
        input,
        name: defaultInputLabel(input),
        type,
        default: cloneJsonValue(value),
        options: [],
    };
    if (type === "number" || type === "slider") {
        const numberValue = typeof value === "number" ? value : 0;
        field.min = 0;
        field.max = Math.max(numberValue * 2, 10);
        field.step = numberValue > 0 && numberValue < 5 ? 0.1 : 1;
        field.randomEnabled = /seed|noise/i.test(input);
    }
    return field;
}

export function applyComfyWorkflowFields(workflow: ComfyWorkflowJson, fields: ComfyWorkflowField[], values: Record<string, unknown>) {
    const next = cloneJsonValue(workflow) as ComfyWorkflowJson;
    fields.forEach((field) => {
        const node = next[field.node];
        if (!node?.inputs) return;
        node.inputs[field.input] = normalizeFieldValue(field, values[field.id] ?? field.default);
    });
    return next;
}

function isWorkflowLink(value: unknown) {
    return Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "number";
}

function guessFieldType(input: string, value: unknown): ComfyWorkflowFieldType {
    const key = input.toLowerCase();
    if (typeof value === "boolean") return "boolean";
    if (typeof value === "number") return /strength|cfg|denoise|guidance/i.test(key) ? "slider" : "number";
    if (typeof value === "string") {
        if (/prompt|text|caption|description|positive|negative/i.test(key) || value.length > 80) return "textarea";
        if (/video|movie|mp4|webm|mov|m4v/i.test(key) || /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(value)) return "video";
        if (/audio|sound|music|voice|wav|mp3/i.test(key) || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(value)) return "audio";
        if (/image|img|mask|filename|file/i.test(key) || /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(value)) return "image";
    }
    return "text";
}

function defaultInputLabel(input: string) {
    const labels: Record<string, string> = {
        text: "提示词",
        prompt: "提示词",
        positive: "正向提示词",
        negative: "负向提示词",
        seed: "随机种子",
        noise_seed: "随机种子",
        steps: "步数",
        cfg: "CFG",
        sampler_name: "采样器",
        scheduler: "调度器",
        denoise: "重绘强度",
        width: "宽度",
        height: "高度",
        image: "图片",
        mask: "蒙版",
        filename_prefix: "文件名前缀",
    };
    return labels[input] || input;
}

function normalizeFieldValue(field: ComfyWorkflowField, value: unknown) {
    if (field.type === "number" || field.type === "slider") {
        const numberValue = Number(value);
        return Number.isFinite(numberValue) ? numberValue : Number(field.default) || 0;
    }
    if (field.type === "boolean") return Boolean(value);
    return value ?? "";
}

function cloneJsonValue(value: unknown) {
    return JSON.parse(JSON.stringify(value));
}

/** ComfyUI 工作流能力：反推提示词 / 文生图 / 参考图生图 / 图生视频 */
export type ComfyOutputType = "text" | "image" | "video";

/** ComfyUI 工作流能力（两级：输出媒体类型 → 细分能力） */
export type ComfyUiCapability =
    | "text-to-text" | "image-to-text"
    | "text-to-image" | "image-to-image"
    | "text-to-video" | "image-to-video" | "reference-video";

export const COMFY_CAPABILITY_META: Record<ComfyUiCapability, { output: ComfyOutputType; label: string }> = {
    "text-to-text": { output: "text", label: "文生文" },
    "image-to-text": { output: "text", label: "图生文" },
    "text-to-image": { output: "image", label: "文生图" },
    "image-to-image": { output: "image", label: "参考图生图" },
    "text-to-video": { output: "video", label: "文生视频" },
    "image-to-video": { output: "video", label: "图片生视频" },
    "reference-video": { output: "video", label: "全能参考生视频" },
};

const COMFY_IMAGE_TO_TEXT_NODES = /tagger|interrogator|caption|wd14|llava|qwen.*vl|clip.*interrogat|image.*to.*text|blip/i;
const COMFY_VIDEO_OUTPUT_NODES = /savevideo|video.*output|vhs_|save.*mp4|mux|video.*combine/i;
const COMFY_IMAGE_OUTPUT_NODES = /saveimage|previewimage|save.*png|save.*jpg/i;
const COMFY_TEXT_OUTPUT_NODES = /showtext|displaytext|text.*output|previewtext|print/i;

/** 从工作流 JSON 与其字段推断能力（默认文生图）。 */
export function inferComfyWorkflowCapability(workflow: ComfyWorkflowJson | null | undefined, fields: ComfyWorkflowField[] = []): ComfyUiCapability {
    if (!workflow || typeof workflow !== "object") return "text-to-image";
    const classTypes = Object.values(workflow).map((node) => node?.class_type || "");
    const hasImageInput = fields.some((field) => field.type === "image");
    const hasVideoInput = fields.some((field) => field.type === "video");
    const hasAudioInput = fields.some((field) => field.type === "audio");
    const hasImageToText = classTypes.some((type) => COMFY_IMAGE_TO_TEXT_NODES.test(type));
    const hasVideoOutput = classTypes.some((type) => COMFY_VIDEO_OUTPUT_NODES.test(type));
    const hasImageOutput = classTypes.some((type) => COMFY_IMAGE_OUTPUT_NODES.test(type));
    const hasTextOutput = classTypes.some((type) => COMFY_TEXT_OUTPUT_NODES.test(type));
    if (hasImageInput && hasImageToText && !hasImageOutput) return "image-to-text";
    if (hasVideoOutput) {
        if (hasImageInput || hasVideoInput || hasAudioInput) return hasImageInput ? "image-to-video" : "reference-video";
        return "text-to-video";
    }
    if (hasImageInput && hasImageOutput) return "image-to-image";
    if (hasImageInput) return "image-to-image";
    if (hasTextOutput) return "text-to-text";
    return "text-to-image";
}
