import axios from "axios";

import { buildApiUrl, modelOptionName, resolveModelRequestConfig, type AiConfig, type ImageResponseFormatPolicy, type ModelChannel } from "@/flowcanvas/stores/use-config-store";
import { rewriteThroughProxy } from "@/flowcanvas/lib/ai-proxy-url";
import { nanoid } from "nanoid";
import { dataUrlToFile } from "@/flowcanvas/lib/image-utils";
import { buildImageReferencePromptText } from "@/flowcanvas/lib/image-reference-prompt";
import { isSeedreamImageModel, resolveSeedreamSize, seedreamEditError, seedreamGenerationError, seedreamSupportsOutputFormat } from "@/flowcanvas/lib/seedream-image";
import { uploadImageToCurrentBackend } from "@/flowcanvas/services/api/backend";
import { durableGenerationHeaders, type DurableGenerationOptions } from "@/flowcanvas/services/api/generation-jobs";
import {
    resolveImageModelCapabilityForRequest,
    type ImageGenerationMode,
    type ImageModelCapability,
} from "@/flowcanvas/services/api/model-capabilities";
import { imageToDataUrl, imageToFile } from "@/flowcanvas/services/image-storage";
import { useUserStore } from "@/flowcanvas/stores/use-user-store";
import type { ReferenceImage } from "@/flowcanvas/types/image";

/** 图像生成请求超时（毫秒），高分辨率生成可能需要较长时间 */
const IMAGE_GENERATION_TIMEOUT_MS = 1_800_000;
/** 流式聊天请求超时（毫秒） */
const STREAMING_CHAT_TIMEOUT_MS = 1_800_000;

export type AiTextMessage = {
    role: "system" | "user" | "assistant";
    content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
    /** DeepSeek 等思考模式模型要求多轮对话回传的思考内容。 */
    reasoningContent?: string;
};

export type ResponseToolCall = {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
    thoughtSignature?: string;
};

export type ResponseInputMessage = AiTextMessage | { type: "function_call"; call_id: string; name: string; arguments: string; thoughtSignature?: string; reasoningContent?: string } | { role: "tool"; tool_call_id: string; content: string };

export type ResponseFunctionTool = {
    type: "function";
    function: {
        name: string;
        description?: string;
        parameters: Record<string, unknown>;
        strict?: boolean;
    };
};

export type ToolResponseResult = {
    content: string;
    toolCalls: ResponseToolCall[];
    /** 思考模式模型的思考内容（reasoning_content），多轮对话需回传。 */
    reasoningContent?: string;
};

type ToolChoice = "auto" | "required" | { type: "function"; name: string };

/** 思考模式模型拒绝强制工具调用的错误特征（如 "Thinking mode does not support this tool_choice"）。 */
const TOOL_CHOICE_UNSUPPORTED_PATTERN = /does not support this tool_choice|tool_choice.*?(not support|unsupported)|thinking.*?tool_choice/i;

type ResponseMessageContent = AiTextMessage["content"] | string;
type ResponseInputContent = { type: "input_text"; text: string } | { type: "input_image"; image_url: string };
type ResponseInputItem = { role: "system" | "user" | "assistant"; content: string | ResponseInputContent[] } | { type: "function_call"; call_id: string; name: string; arguments: string } | { type: "function_call_output"; call_id: string; output: string };
type ResponseApiToolDefinition = {
    type: "function";
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
    strict?: boolean;
};
type ResponseApiOutputItem = { type?: "message"; content?: Array<{ type?: string; text?: string }> } | { type?: "function_call"; id?: string; call_id?: string; name?: string; arguments?: string };
type ResponseApiPayload = {
    id?: string;
    output?: ResponseApiOutputItem[];
    output_text?: string;
    error?: { message?: string };
    code?: number;
    msg?: string;
};
type ChatMessageContent = string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
type ChatMessage = { role: "system" | "user" | "assistant" | "tool"; content?: ChatMessageContent; reasoning_content?: string; tool_call_id?: string; tool_calls?: ResponseToolCall[] };
type ChatToolDefinition = ResponseFunctionTool;
type ChatCompletionPayload = {
    choices?: Array<{
        delta?: { content?: string; reasoning_content?: string; tool_calls?: ChatDeltaToolCall[] };
        message?: { content?: string | null; reasoning_content?: string; tool_calls?: ResponseToolCall[] };
    }>;
    error?: { message?: string };
    code?: number;
    msg?: string;
};
type ChatDeltaToolCall = { index?: number; id?: string; type?: "function"; function?: { name?: string; arguments?: string } };
type ChatStreamState = { buffer: string; text: string; reasoningContent: string; toolCalls: ResponseToolCall[]; error?: string };
type ResponseStreamState = { buffer: string; text: string; payload?: ResponseApiPayload; error?: string };

type ImageApiResponse = Record<string, unknown> & {
    data?: unknown;
    error?: unknown;
    code?: number | string;
    msg?: string;
};
type GeminiPart = {
    text?: string;
    inlineData?: { mimeType?: string; data?: string };
    inline_data?: { mime_type?: string; mimeType?: string; data?: string };
    fileData?: { mimeType?: string; fileUri?: string };
    functionCall?: { id?: string; name?: string; args?: Record<string, unknown> };
    functionResponse?: { id?: string; name?: string; response?: Record<string, unknown> };
    thoughtSignature?: string;
    thought_signature?: string;
};
type GeminiContent = { role?: "user" | "model"; parts: GeminiPart[] };
type GeminiPayload = {
    candidates?: Array<{ content?: { parts?: GeminiPart[] }; finishReason?: string }>;
    models?: Array<{ name?: string }>;
    error?: { message?: string };
    promptFeedback?: { blockReason?: string };
};
type GeminiStreamState = { buffer: string; text: string; toolCalls: ResponseToolCall[]; error?: string };
type RequestOptions = DurableGenerationOptions;

const RESOLUTION_BASE: Record<string, number> = {
    "1k": 1024,
    "2k": 2048,
    "4k": 2880,
};
const LEGACY_RESOLUTION_ALIASES: Record<string, string> = {
    low: "1k",
    standard: "2k",
    medium: "2k",
    hd: "2k",
    high: "4k",
};
const DEFAULT_IMAGE_SHORT_SIDE = 1024;
const IMAGE_SIZE_STEP = 16;
const IMAGE_MIN_PIXELS = 655360;
const IMAGE_MAX_PIXELS = 8294400;
const IMAGE_MAX_EDGE = 3840;
const IMAGE_MAX_RATIO = 3;
const IMAGE_OUTPUT_FORMAT = "png";

// 模型名包含这些子串时认为支持 OpenAI DALL-E / GPT-Image 系列的 `response_format: "b64_json"` 参数。
const B64_JSON_MODEL_KEYWORDS = ["dall-e", "dalle", "gpt-image"];

export function isAgnesImageModel(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return value.startsWith("agnes-image") || value.includes("agnes-image") || value.startsWith("agnes-t2i") || value.includes("agnes-t2i");
}

/**
 * 决定生图请求是否应当带上 `response_format: "b64_json"`。
 *
 * - `b64_json`：强制带上；
 * - `url`：强制不带，让模型自己决定返回 URL 或 base64；
 * - `auto`：仅当模型名匹配 OpenAI 已知生图模型时带上，避免 litellm / 自定义代理因不识别该参数而抛 `UnsupportedParamsError`。
 */
export function shouldUseB64JsonResponse(config: Pick<AiConfig, "imageResponseFormat">, model: string): boolean {
    const policy: ImageResponseFormatPolicy = config.imageResponseFormat || "auto";
    if (policy === "b64_json") return true;
    if (policy === "url") return false;
    const name = modelOptionName(model).toLowerCase();
    return B64_JSON_MODEL_KEYWORDS.some((keyword) => name.includes(keyword));
}

export function requestedImageResponseFormat(config: Pick<AiConfig, "imageResponseFormat">, model: string): "b64_json" | undefined {
    if (isAgnesImageModel(model) || config.imageResponseFormat === "url") return undefined;
    return shouldUseB64JsonResponse(config, model) ? "b64_json" : undefined;
}

function normalizeQuality(quality: string) {
    const value = quality.trim().toLowerCase();
    return ["low", "medium", "high", "standard", "hd"].includes(value) ? value : undefined;
}

function normalizeResolution(resolution: string | undefined) {
    const value = String(resolution || "").trim().toLowerCase();
    const normalized = LEGACY_RESOLUTION_ALIASES[value] || value;
    return RESOLUTION_BASE[normalized] ? normalized : undefined;
}

function requestQuality(quality: string | undefined, capability: ImageModelCapability | null) {
    const normalized = normalizeQuality(quality || "");
    if (!normalized || !capability?.qualities.length) return normalized;
    const accepted = capability.qualities.map((item) => item.toLowerCase());
    if (accepted.includes(normalized)) return normalized;
    if (normalized === "medium" && accepted.includes("standard")) return "standard";
    if (normalized === "standard" && accepted.includes("medium")) return "medium";
    return normalized;
}

/** Map "resolution + ratio" to an explicit pixel dimension like "3840x2160". */
function resolveSize(resolution: string | undefined, ratio: string): string {
    const parsedRatio = parseImageRatio(ratio);
    const basePixels = resolution ? RESOLUTION_BASE[resolution] : undefined;
    const isLandscape = parsedRatio.width >= parsedRatio.height;
    const longRatio = isLandscape ? parsedRatio.width / parsedRatio.height : parsedRatio.height / parsedRatio.width;
    let longSide: number;
    let shortSide: number;

    if (basePixels) {
        const targetPixels = basePixels * basePixels;
        const longSideRaw = Math.sqrt(targetPixels * longRatio);
        longSide = Math.floor(longSideRaw / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
        shortSide = Math.floor(longSide / longRatio / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    } else {
        shortSide = DEFAULT_IMAGE_SHORT_SIDE;
        longSide = Math.round((shortSide * longRatio) / IMAGE_SIZE_STEP) * IMAGE_SIZE_STEP;
    }

    const width = isLandscape ? longSide : shortSide;
    const height = isLandscape ? shortSide : longSide;
    validateImageSize(width, height);
    return `${width}x${height}`;
}

function parseImageRatio(value: string) {
    const parts = value.split(":");
    if (parts.length !== 2) throw new Error("图像尺寸格式不支持，请使用 auto、9:16 或 1024x1024");
    const w = Number(parts[0]);
    const h = Number(parts[1]);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) throw new Error("图像比例必须是正数，例如 9:16");
    if (Math.max(w, h) / Math.min(w, h) > IMAGE_MAX_RATIO) throw new Error("图像宽高比不能超过 3:1，请调整尺寸");
    return { width: w, height: h };
}

function parseImageDimensions(value: string) {
    const match = value.match(/^(\d+)x(\d+)$/i);
    if (!match) return null;
    return { width: Number(match[1]), height: Number(match[2]) };
}

function validateImageSize(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new Error("图像尺寸必须是正整数，例如 1024x1024");
    if (width % IMAGE_SIZE_STEP !== 0 || height % IMAGE_SIZE_STEP !== 0) throw new Error("图像尺寸的宽高必须是 16 的倍数，请调整尺寸");
    if (Math.max(width, height) > IMAGE_MAX_EDGE) throw new Error("图像尺寸最长边不能超过 3840px，请调整尺寸");
    if (Math.max(width, height) / Math.min(width, height) > IMAGE_MAX_RATIO) throw new Error("图像宽高比不能超过 3:1，请调整尺寸");
    const pixels = width * height;
    if (pixels < IMAGE_MIN_PIXELS || pixels > IMAGE_MAX_PIXELS) throw new Error("图像总像素需在 655360 到 8294400 之间，请调整尺寸");
}

function resolveRequestSize(resolution: string | undefined, size: string) {
    const value = size.trim();
    if (!value || value.toLowerCase() === "auto") return undefined;
    const dimensions = parseImageDimensions(value);
    if (dimensions) {
        validateImageSize(dimensions.width, dimensions.height);
        return `${dimensions.width}x${dimensions.height}`;
    }
    if (value.includes(":")) return resolveSize(resolution, value);
    throw new Error("图像尺寸格式不支持，请使用 auto、9:16 或 1024x1024");
}

const JUNLI_IMAGE_SIZE_TABLE: Record<string, Record<string, string>> = {
    "1k": {
        "1:1": "1024x1024",
        "16:9": "1280x720",
        "9:16": "720x1280",
        "4:3": "1024x768",
        "3:4": "768x1024",
        "21:9": "1680x720",
    },
    "2k": {
        "1:1": "2048x2048",
        "16:9": "2048x1152",
        "9:16": "1152x2048",
        "4:3": "2048x1536",
        "3:4": "1536x2048",
        "21:9": "2520x1080",
    },
    "4k": {
        "1:1": "4096x4096",
        "16:9": "4096x2304",
        "9:16": "2304x4096",
        "4:3": "4096x3072",
        "3:4": "3072x4096",
        "21:9": "5040x2160",
    },
};

function isJunliImageModel(model: string) {
    const value = modelOptionName(model).toLowerCase();
    return value.includes("junliimg") || value.includes("junliai");
}

function resolveImageRequestSize(model: string, resolution: string | undefined, size: string) {
    if (!isJunliImageModel(model)) return resolveRequestSize(resolution, size);
    const value = size.trim();
    if (!value || value.toLowerCase() === "auto") return undefined;
    if (!value.includes(":")) return resolveRequestSize(resolution, value);
    return JUNLI_IMAGE_SIZE_TABLE[resolution || "2k"]?.[value] || resolveRequestSize(resolution, value);
}

function resolveImageDataUrl(item: Record<string, unknown>, useProxy?: boolean) {
    if (typeof item.b64_json === "string" && item.b64_json) {
        return `data:image/png;base64,${item.b64_json}`;
    }
    const directUrl = stringValue(item.url) || stringValue(item.dataUrl) || stringValue(item.data_url) || stringValue(item.image_url) || stringValue(item.output_url) || stringValue(item.file_url) || stringValue(item.public_url);
    if (directUrl) return rewriteThroughProxy(directUrl, useProxy);
    const imageUrl = isRecord(item.image_url) ? stringValue(item.image_url.url) : "";
    if (imageUrl) return rewriteThroughProxy(imageUrl, useProxy);
    return null;
}

function parseImagePayload(payload: ImageApiResponse, useProxy?: boolean) {
    if (payload.error) {
        const errorMessage = readPayloadError(payload.error);
        if (errorMessage) throw new Error(errorMessage);
    }
    if (payload.code != null && !isSuccessCode(payload.code)) {
        throw new Error(payload.msg || "请求失败");
    }
    const records = collectImagePayloadRecords(payload);
    const itemError = records.map((item) => item.error).find(Boolean);
    if (typeof itemError === "string") throw new Error(itemError);
    if (isRecord(itemError)) throw new Error(stringValue(itemError.message) || stringValue(itemError.msg) || "图片生成失败");
    const images =
        records
            .map((item) => resolveImageDataUrl(item, useProxy))
            .filter((value): value is string => Boolean(value))
            .map((dataUrl) => ({ id: nanoid(), dataUrl })) || [];

    if (images.length === 0) {
        throw new Error("接口没有返回图片");
    }

    return images;
}

function isSuccessCode(code: number | string) {
    const value = typeof code === "string" ? Number(code) : code;
    return value === 0 || value === 200;
}

function readPayloadError(error: unknown) {
    if (typeof error === "string") return error;
    if (!isRecord(error)) return "";
    return stringValue(error.message) || stringValue(error.msg) || stringValue(error.detail) || "";
}

function collectImagePayloadRecords(value: unknown, records: Array<Record<string, unknown>> = [], seen = new WeakSet<object>()) {
    if (!value) return records;
    if (typeof value === "string") {
        if (looksLikeImageSource(value)) records.push({ url: value });
        return records;
    }
    if (Array.isArray(value)) {
        value.forEach((item) => collectImagePayloadRecords(item, records, seen));
        return records;
    }
    if (!isRecord(value) || seen.has(value)) return records;
    seen.add(value);

    if (hasImagePayloadField(value)) records.push(value);
    ["data", "images", "image", "output", "outputs", "result", "results"].forEach((key) => collectImagePayloadRecords(value[key], records, seen));
    return records;
}

function hasImagePayloadField(value: Record<string, unknown>) {
    return Boolean(value.b64_json || value.url || value.dataUrl || value.data_url || value.image_url || value.output_url || value.file_url || value.public_url);
}

function looksLikeImageSource(value: string) {
    return /^data:image\//i.test(value) || /^https?:\/\//i.test(value) || /^blob:/i.test(value);
}

function readAxiosError(error: unknown, fallback: string) {
    if (axios.isCancel(error)) return "请求已取消";
    if (axios.isAxiosError<{ error?: { message?: string }; msg?: string; code?: number } | string>(error)) {
        if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") return "请求超时，请检查网络或稍后重试";
        const responseData = error.response?.data;
        if (typeof responseData === "string") {
            return normalizeUpstreamMessage(responseData) || responseData.trim() || readStatusError(error.response?.status, fallback);
        }
        return responseData?.msg || normalizeUpstreamMessage(responseData?.error?.message) || readStatusError(error.response?.status, fallback);
    }
    if (error instanceof DOMException && error.name === "AbortError") return "请求已取消";
    return error instanceof Error ? error.message : fallback;
}

/** 把上游 OpenAI 兼容格式的长错误精简成中文短句，便于在画布上提示用户 */
function normalizeUpstreamMessage(message: string | undefined): string | undefined {
    if (!message) return undefined;
    if (/ServiceUnavailable|Service busy|Service Unavailable/i.test(message)) return "上游服务繁忙，请稍后重试";
    if (/Rate limit|Too Many Requests|rate limit/i.test(message)) return "请求被限流，请稍后重试";
    if (/Insufficient (quota|balance|credits)/i.test(message)) return "账户余额不足，请充值后重试";
    if (/Invalid API [Kk]ey|authentication|Unauthorized/i.test(message)) return "鉴权失败，请检查 API Key";
    if (/Model not exist|model not found|does not exist/i.test(message)) return "模型不可用，请检查模型名称或权限";
    // 截断过长的原始错误，只保留前 200 字符
    const trimmed = message.length > 200 ? `${message.slice(0, 200)}…` : message;
    return trimmed;
}

function readStatusError(status: number | undefined, fallback: string) {
    if (status === 401 || status === 403) return "鉴权失败，请检查 API Key、套餐权限或模型权限";
    if (status === 429) return "请求被限流或额度不足，请稍后重试";
    if (status === 503) return "上游服务繁忙，请稍后重试";
    if (status === 502 || status === 504) return "上游网关异常，请稍后重试";
    return status ? `${fallback}：${status}` : fallback;
}

function withSystemPrompt(config: AiConfig, prompt: string) {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
}

function aiApiUrl(config: AiConfig, path: string) {
    return buildApiUrl(config.baseUrl, path, config.useProxy);
}

function aiHeaders(config: AiConfig, contentType?: string) {
    return {
        Authorization: `Bearer ${config.apiKey}`,
        ...(contentType ? { "Content-Type": contentType } : {}),
    };
}

function geminiBaseUrl(config: Pick<AiConfig, "baseUrl">) {
    const normalizedBaseUrl = config.baseUrl.trim().replace(/\/+$/, "");
    const lowerBaseUrl = normalizedBaseUrl.toLowerCase();
    return lowerBaseUrl.endsWith("/v1") || lowerBaseUrl.endsWith("/v1beta") ? normalizedBaseUrl : `${normalizedBaseUrl}/v1beta`;
}

function geminiModelName(model: string) {
    return model.trim().replace(/^models\//, "");
}

function geminiApiUrl(config: Pick<AiConfig, "baseUrl" | "model">, action?: "generateContent" | "streamGenerateContent") {
    const baseUrl = geminiBaseUrl(config);
    if (!action) return `${baseUrl}/models`;
    return `${baseUrl}/models/${encodeURIComponent(geminiModelName(config.model))}:${action}`;
}

function geminiHeaders(config: Pick<AiConfig, "apiKey">) {
    return {
        "x-goog-api-key": config.apiKey,
        "Content-Type": "application/json",
    };
}

function withSystemMessage<T extends ResponseInputMessage>(config: AiConfig, messages: T[]): ResponseInputMessage[] {
    const systemPrompt = config.systemPrompt.trim();
    return systemPrompt ? [{ role: "system" as const, content: systemPrompt }, ...messages] : messages;
}

function toResponseInput(messages: ResponseInputMessage[]): ResponseInputItem[] {
    return messages.flatMap((message): ResponseInputItem[] => {
        if ("type" in message) return [message];
        if (message.role === "tool") return [{ type: "function_call_output", call_id: message.tool_call_id, output: message.content }];
        return [{ role: message.role, content: toResponseContent(message.content || "") }];
    });
}

function toResponseContent(content: ResponseMessageContent): string | ResponseInputContent[] {
    if (!Array.isArray(content)) return String(content || "");
    return content.map((item) => (item.type === "text" ? { type: "input_text" as const, text: item.text } : { type: "input_image" as const, image_url: item.image_url.url }));
}

function toResponseTool(tool: ResponseFunctionTool): ResponseApiToolDefinition {
    return {
        type: "function",
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
        strict: tool.function.strict,
    };
}

function toChatMessages(messages: ResponseInputMessage[]): ChatMessage[] {
    return messages.flatMap((message): ChatMessage[] => {
        if ("type" in message) {
            return [
                {
                    role: "assistant",
                    tool_calls: [
                        {
                            id: message.call_id,
                            type: "function",
                            function: { name: message.name, arguments: message.arguments },
                        },
                    ],
                    // DeepSeek 等思考模式模型要求 assistant 消息回传 reasoning_content。
                    ...(message.reasoningContent ? { reasoning_content: message.reasoningContent } : {}),
                },
            ];
        }
        if (message.role === "tool") return [{ role: "tool", tool_call_id: message.tool_call_id, content: message.content }];
        // DeepSeek 等思考模式模型要求 assistant 消息回传 reasoning_content，否则多轮报错。
        if (message.role === "assistant" && message.reasoningContent) {
            return [{ role: "assistant", content: toChatContent(message.content), reasoning_content: message.reasoningContent }];
        }
        return [{ role: message.role, content: toChatContent(message.content) }];
    });
}

/** 纯文本 content 数组转字符串（DeepSeek 等厂商要求 content 为字符串）；含图保持数组。 */
function toChatContent(content: unknown): ChatMessageContent {
    if (typeof content === "string" || content == null) return content || "";
    if (Array.isArray(content)) {
        if (content.every((item) => item.type === "text")) return content.map((item) => item.text).join("\n\n");
        return content as ChatMessageContent;
    }
    return content as ChatMessageContent;
}

function toChatToolChoice(toolChoice: ToolChoice) {
    if (typeof toolChoice === "object") return { type: "function", function: { name: toolChoice.name } };
    return toolChoice;
}

function toChatTool(tool: ResponseFunctionTool): ChatToolDefinition {
    return tool;
}

function parseChatToolResponse(payload: ChatCompletionPayload): ToolResponseResult {
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || "请求失败");
    if (payload.error?.message) throw new Error(payload.error.message);
    const message = payload.choices?.[0]?.message;
    return { content: message?.content || "", toolCalls: message?.tool_calls || [], reasoningContent: message?.reasoning_content || undefined };
}

function parseToolResponse(payload: ResponseApiPayload): ToolResponseResult {
    const output = payload.output || [];
    const content =
        payload.output_text ||
        output
            .flatMap((item) => (item.type === "message" ? item.content || [] : []))
            .map((item) => item.text || "")
            .join("");
    const toolCalls = output
        .filter((item): item is Extract<ResponseApiOutputItem, { type?: "function_call" }> => item.type === "function_call")
        .map((item) => ({
            id: item.call_id || item.id || "",
            type: "function" as const,
            function: { name: item.name || "", arguments: item.arguments || "{}" },
        }))
        .filter((item) => item.id && item.function.name);
    return { content, toolCalls };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function responseErrorMessage(value: unknown) {
    if (!isRecord(value)) return "";
    const error = isRecord(value.error) ? value.error : undefined;
    const response = isRecord(value.response) ? value.response : undefined;
    const responseError = response && isRecord(response.error) ? response.error : undefined;
    return stringValue(value.msg) || stringValue(error?.message) || stringValue(responseError?.message);
}

function stringValue(value: unknown) {
    return typeof value === "string" ? value : "";
}

function validateResponsePayload(payload: ResponseApiPayload) {
    if (typeof payload.code === "number" && payload.code !== 0) throw new Error(payload.msg || "请求失败");
    if (payload.error?.message) throw new Error(payload.error.message);
}

function validateGeminiPayload(payload: GeminiPayload) {
    if (payload.error?.message) throw new Error(payload.error.message);
    if (payload.promptFeedback?.blockReason) throw new Error(`Gemini 拒绝了本次请求：${payload.promptFeedback.blockReason}`);
}

async function readFetchError(response: Response, fallback: string) {
    const text = await response.text();
    if (!text) return readStatusError(response.status, fallback);
    try {
        return responseErrorMessage(JSON.parse(text)) || readStatusError(response.status, fallback);
    } catch {
        return text.slice(0, 300) || readStatusError(response.status, fallback);
    }
}

function consumeResponseStreamBlock(block: string, state: ResponseStreamState, onDelta?: (text: string) => void) {
    const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n")
        .trim();
    if (!data || data === "[DONE]") return;
    const event = JSON.parse(data) as Record<string, unknown>;
    const type = stringValue(event.type);
    const errorMessage = responseErrorMessage(event);
    if (errorMessage) state.error = errorMessage;
    if (type === "response.output_text.delta" && typeof event.delta === "string") {
        state.text += event.delta;
        onDelta?.(state.text);
    }
    if (type === "response.output_text.done" && !state.text && typeof event.text === "string") {
        state.text = event.text;
        onDelta?.(state.text);
    }
    if (type === "response.completed" && isRecord(event.response)) {
        state.payload = event.response as ResponseApiPayload;
    } else if (Array.isArray(event.output)) {
        state.payload = event as ResponseApiPayload;
    }
}

function consumeResponseStreamText(state: ResponseStreamState, text: string, onDelta?: (text: string) => void, flush = false) {
    state.buffer += text;
    for (;;) {
        const match = state.buffer.match(/\r?\n\r?\n/);
        if (!match) break;
        consumeResponseStreamBlock(state.buffer.slice(0, match.index!), state, onDelta);
        state.buffer = state.buffer.slice(match.index! + match[0].length);
    }
    if (flush && state.buffer.trim()) {
        consumeResponseStreamBlock(state.buffer, state, onDelta);
        state.buffer = "";
    }
}

function consumeChatStreamBlock(block: string, state: ChatStreamState, onDelta?: (text: string) => void) {
    const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n")
        .trim();
    if (!data || data === "[DONE]") return;
    const payload = JSON.parse(data) as ChatCompletionPayload;
    const errorMessage = responseErrorMessage(payload);
    if (errorMessage) state.error = errorMessage;
    const delta = payload.choices?.[0]?.delta;
    if (delta?.content) {
        state.text += delta.content;
        onDelta?.(state.text);
    }
    if (delta?.reasoning_content) state.reasoningContent += delta.reasoning_content;
    delta?.tool_calls?.forEach((item) => mergeChatDeltaToolCall(state.toolCalls, item));
}

function consumeChatStreamText(state: ChatStreamState, text: string, onDelta?: (text: string) => void, flush = false) {
    state.buffer += text;
    for (;;) {
        const match = state.buffer.match(/\r?\n\r?\n/);
        if (!match) break;
        consumeChatStreamBlock(state.buffer.slice(0, match.index!), state, onDelta);
        state.buffer = state.buffer.slice(match.index! + match[0].length);
    }
    if (flush && state.buffer.trim()) {
        consumeChatStreamBlock(state.buffer, state, onDelta);
        state.buffer = "";
    }
}

function mergeChatDeltaToolCall(toolCalls: ResponseToolCall[], delta: ChatDeltaToolCall) {
    const index = delta.index ?? toolCalls.length;
    const existing = toolCalls[index] || { id: "", type: "function" as const, function: { name: "", arguments: "" } };
    toolCalls[index] = {
        id: delta.id || existing.id,
        type: "function",
        function: {
            name: delta.function?.name || existing.function.name,
            arguments: `${existing.function.arguments || ""}${delta.function?.arguments || ""}`,
        },
    };
}

async function requestStreamingChatCompletion(config: AiConfig, body: Record<string, unknown>, onDelta?: (text: string) => void, options?: RequestOptions): Promise<ToolResponseResult> {
    const timeoutSignal = AbortSignal.timeout(STREAMING_CHAT_TIMEOUT_MS);
    const signal = options?.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
    const url = aiApiUrl(config, "/chat/completions");
    const request = (stream: boolean) => fetch(url, {
        method: "POST",
        headers: { ...aiHeaders(config, "application/json"), ...durableGenerationHeaders(url, options?.jobId), Accept: stream ? "text/event-stream" : "application/json" },
        body: JSON.stringify({ ...body, stream }),
        signal,
    });
    const response = await request(true);
    if (!response.ok) {
        const message = await readFetchError(response, "request failed");
        // Some OpenAI-compatible gateways accept chat completions but reject SSE (often as 500).
        // Retry once without streaming so vision/reverse-prompt models can still return JSON.
        if (response.status < 500 || signal.aborted) throw new Error(message);
        const fallbackResponse = await request(false);
        if (!fallbackResponse.ok) throw new Error(await readFetchError(fallbackResponse, message));
        return parseChatToolResponse((await fallbackResponse.json()) as ChatCompletionPayload);
    }
    const responseType = response.headers.get("content-type")?.toLowerCase() || "";
    if (response.body && !responseType.includes("text/event-stream")) {
        const text = await response.text();
        try {
            return parseChatToolResponse(JSON.parse(text) as ChatCompletionPayload);
        } catch {
            // 网关未声明 content-type 却返回了 SSE 报文：按流解析兜底。
            const state: ChatStreamState = { buffer: "", text: "", reasoningContent: "", toolCalls: [] };
            consumeChatStreamText(state, text, onDelta, true);
            if (state.error) throw new Error(state.error);
            return { content: state.text, toolCalls: state.toolCalls.filter((item) => item.id && item.function.name), reasoningContent: state.reasoningContent || undefined };
        }
    }
    if (!response.body) {
        return parseChatToolResponse((await response.json()) as ChatCompletionPayload);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const state: ChatStreamState = { buffer: "", text: "", reasoningContent: "", toolCalls: [] };
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        consumeChatStreamText(state, decoder.decode(value, { stream: true }), onDelta);
        if (state.error) throw new Error(state.error);
    }
    consumeChatStreamText(state, decoder.decode(), onDelta, true);
    if (state.error) throw new Error(state.error);
    return { content: state.text, toolCalls: state.toolCalls.filter((item) => item.id && item.function.name), reasoningContent: state.reasoningContent || undefined };
}

function toGeminiBody(config: AiConfig, messages: ResponseInputMessage[], extra?: Record<string, unknown>) {
    const systemText = [config.systemPrompt.trim(), ...messages.flatMap((message) => (!("type" in message) && message.role === "system" ? [geminiTextContent(message.content)] : []))].filter(Boolean).join("\n\n");
    const contents = toGeminiContents(messages.filter((message) => ("type" in message ? true : message.role !== "system")));
    return {
        contents,
        ...(systemText ? { systemInstruction: { parts: [{ text: systemText }] } } : {}),
        ...extra,
    };
}

function toGeminiContents(messages: ResponseInputMessage[]): GeminiContent[] {
    const callNameById = new Map<string, string>();
    return messages.flatMap((message): GeminiContent[] => {
        if ("type" in message) {
            callNameById.set(message.call_id, message.name);
            return [{ role: "model", parts: [{ functionCall: { id: message.call_id, name: message.name, args: jsonObject(message.arguments) }, ...(message.thoughtSignature ? { thoughtSignature: message.thoughtSignature } : {}) }] }];
        }
        if (message.role === "tool") {
            const name = callNameById.get(message.tool_call_id) || "tool_result";
            return [{ role: "user", parts: [{ functionResponse: { id: message.tool_call_id, name, response: { result: jsonValue(message.content) } } }] }];
        }
        return [{ role: message.role === "assistant" ? "model" : "user", parts: toGeminiParts(message.content) }];
    });
}

function toGeminiParts(content: ResponseMessageContent): GeminiPart[] {
    if (!Array.isArray(content)) return [{ text: String(content || "") }];
    return content.map((item) => (item.type === "text" ? { text: item.text } : toGeminiImagePart(item.image_url.url)));
}

function toGeminiImagePart(url: string): GeminiPart {
    const match = url.match(/^data:([^;,]+);base64,(.+)$/);
    if (match) return { inlineData: { mimeType: match[1], data: match[2] } };
    return { fileData: { fileUri: url, mimeType: "image/png" } };
}

function geminiTextContent(content: ResponseMessageContent) {
    if (!Array.isArray(content)) return String(content || "");
    return content.map((item) => (item.type === "text" ? item.text : item.image_url.url)).join("\n");
}

function jsonObject(value: string): Record<string, unknown> {
    const parsed = jsonValue(value);
    return isRecord(parsed) ? parsed : {};
}

function jsonValue(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

function toGeminiToolOptions(tools: ResponseFunctionTool[], toolChoice: ToolChoice) {
    if (!tools.length) return {};
    const functionDeclarations = tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
    }));
    const functionCallingConfig = typeof toolChoice === "object" ? { mode: "ANY", allowedFunctionNames: [toolChoice.name] } : { mode: toolChoice === "required" ? "ANY" : "AUTO" };
    return {
        tools: [{ functionDeclarations }],
        toolConfig: { functionCallingConfig },
    };
}

async function requestGeminiStreamingResponse(config: AiConfig, body: Record<string, unknown>, onDelta?: (text: string) => void, options?: RequestOptions): Promise<ToolResponseResult> {
    const timeoutSignal = AbortSignal.timeout(STREAMING_CHAT_TIMEOUT_MS);
    const signal = options?.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
    const url = `${geminiApiUrl(config, "streamGenerateContent")}?alt=sse`;
    const response = await fetch(url, {
        method: "POST",
        headers: { ...geminiHeaders(config), ...durableGenerationHeaders(url, options?.jobId) },
        body: JSON.stringify(body),
        signal,
    });
    if (!response.ok) throw new Error(await readFetchError(response, "请求失败"));
    if (!response.body) {
        const payload = (await response.json()) as GeminiPayload;
        return parseGeminiToolResponse(payload);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const state: GeminiStreamState = { buffer: "", text: "", toolCalls: [] };
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        consumeGeminiStreamText(state, decoder.decode(value, { stream: true }), onDelta);
        if (state.error) throw new Error(state.error);
    }
    consumeGeminiStreamText(state, decoder.decode(), onDelta, true);
    if (state.error) throw new Error(state.error);
    return { content: state.text, toolCalls: state.toolCalls };
}

function consumeGeminiStreamText(state: GeminiStreamState, text: string, onDelta?: (text: string) => void, flush = false) {
    state.buffer += text;
    for (;;) {
        const match = state.buffer.match(/\r?\n\r?\n/);
        if (!match) break;
        consumeGeminiStreamBlock(state.buffer.slice(0, match.index!), state, onDelta);
        state.buffer = state.buffer.slice(match.index! + match[0].length);
    }
    if (flush && state.buffer.trim()) {
        consumeGeminiStreamBlock(state.buffer, state, onDelta);
        state.buffer = "";
    }
}

function consumeGeminiStreamBlock(block: string, state: GeminiStreamState, onDelta?: (text: string) => void) {
    const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n")
        .trim();
    if (!data || data === "[DONE]") return;
    const result = parseGeminiToolResponse(JSON.parse(data) as GeminiPayload);
    if (result.content) {
        state.text += result.content;
        onDelta?.(state.text);
    }
    state.toolCalls.push(...result.toolCalls);
}

function parseGeminiToolResponse(payload: GeminiPayload): ToolResponseResult {
    validateGeminiPayload(payload);
    const parts = payload.candidates?.flatMap((candidate) => candidate.content?.parts || []) || [];
    const content = parts.map((part) => part.text || "").join("");
    const toolCalls = parts
        .map((part) => part.functionCall)
        .filter((call): call is NonNullable<GeminiPart["functionCall"]> => Boolean(call?.name))
        .map((call) => {
            const part = parts.find((item) => item.functionCall === call);
            const thoughtSignature = part?.thoughtSignature || part?.thought_signature;
            return {
                id: call.id || nanoid(),
                type: "function" as const,
                function: { name: call.name || "", arguments: JSON.stringify(call.args || {}) },
                ...(thoughtSignature ? { thoughtSignature } : {}),
            };
        });
    return { content, toolCalls };
}

async function requestGeminiImages(config: AiConfig, prompt: string, references: ReferenceImage[], count: number, options?: RequestOptions) {
    const requests = Array.from({ length: count }, () => requestGeminiImagesOnce(config, prompt, references, options));
    return (await Promise.all(requests)).flat();
}

async function requestGeminiImagesOnce(config: AiConfig, prompt: string, references: ReferenceImage[], options?: RequestOptions) {
    const parts: GeminiPart[] = [{ text: prompt }];
    for (const image of references) {
        parts.push(toGeminiImagePart(await imageToDataUrl(image)));
    }
    const url = geminiApiUrl(config, "generateContent");
    const response = await axios.post<GeminiPayload>(
        url,
        {
            ...toGeminiBody(config, [{ role: "user", content: prompt }], { generationConfig: { responseModalities: ["TEXT", "IMAGE"] } }),
            contents: [{ role: "user", parts }],
        },
        { headers: { ...geminiHeaders(config), ...durableGenerationHeaders(url, options?.jobId) }, signal: options?.signal, timeout: IMAGE_GENERATION_TIMEOUT_MS },
    );
    return parseGeminiImagePayload(response.data, config.useProxy);
}

function parseGeminiImagePayload(payload: GeminiPayload, useProxy?: boolean) {
    validateGeminiPayload(payload);
    const images =
        payload.candidates
            ?.flatMap((candidate) => candidate.content?.parts || [])
            .map((part) => {
                const inlineData = part.inlineData || (part.inline_data ? { mimeType: part.inline_data.mimeType || part.inline_data.mime_type, data: part.inline_data.data } : undefined);
                if (inlineData?.data) return `data:${inlineData.mimeType || "image/png"};base64,${inlineData.data}`;
                return part.fileData?.fileUri ? rewriteThroughProxy(part.fileData.fileUri, useProxy) : null;
            })
            .filter((value): value is string => Boolean(value))
            .map((dataUrl) => ({ id: nanoid(), dataUrl })) || [];
    if (!images.length) throw new Error("Gemini 接口没有返回图片");
    return images;
}

export async function requestGeneration(config: AiConfig, prompt: string, options?: RequestOptions) {
    const selectedModel = config.model || config.imageModel;
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const capability = await resolveImageModelCapabilityForRequest(modelOptionName(selectedModel));
    validateImageCapability(capability, "text-to-image", 0, n);
    if (requestConfig.apiFormat === "gemini") {
        try {
            return await requestGeminiImages(requestConfig, prompt, [], n, options);
        } catch (error) {
            throw new Error(readAxiosError(error, "请求失败"));
        }
    }
    const quality = requestQuality(config.quality, capability);
    const resolution = normalizeResolution(config.resolution || config.quality);
    const seedream = isSeedreamImageModel(requestConfig.model);
    const junliImage = isJunliImageModel(selectedModel) || isJunliImageModel(requestConfig.model);
    const seedreamError = seedream ? seedreamGenerationError(requestConfig.model) : "";
    if (seedreamError) throw new Error(seedreamError);
    const requestSize = seedream ? resolveSeedreamSize(requestConfig.model, resolution, config.size) : resolveImageRequestSize(selectedModel, resolution, config.size);
    if (isAgnesImageModel(requestConfig.model)) {
        return requestAgnesImages(requestConfig, withSystemPrompt(requestConfig, prompt), [], n, requestSize, options);
    }
    const responseFormat = requestedImageResponseFormat(config, requestConfig.model);
    try {
        const url = aiApiUrl(requestConfig, "/images/generations");
        const response = await axios.post<ImageApiResponse>(
            url,
            {
                model: requestConfig.model,
                prompt: withSystemPrompt(requestConfig, prompt),
                ...(!junliImage ? imageOutputCountPayload(capability, n) : {}),
                ...(capability ? { _flowcanvas_mode: "text-to-image" } : {}),
                ...(!junliImage && !seedream && quality ? { quality } : {}),
                ...(requestSize ? { size: requestSize } : {}),
                ...(responseFormat ? { response_format: responseFormat } : {}),
                ...(responseFormat === "b64_json" && seedreamSupportsOutputFormat(requestConfig.model) ? { output_format: IMAGE_OUTPUT_FORMAT } : {}),
            },
            {
                headers: { ...aiHeaders(requestConfig, "application/json"), ...durableGenerationHeaders(url, options?.jobId) },
                signal: options?.signal,
                timeout: IMAGE_GENERATION_TIMEOUT_MS,
            },
        );
        const images = parseImagePayload(response.data, requestConfig.useProxy);
        return images;
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
}

export async function requestEdit(config: AiConfig, prompt: string, references: ReferenceImage[], mask?: ReferenceImage, options?: RequestOptions) {
    const selectedModel = config.model || config.imageModel;
    const requestConfig = resolveModelRequestConfig(config, selectedModel);
    const n = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const requestPrompt = buildImageReferencePromptText(prompt, references);
    const capability = await resolveImageModelCapabilityForRequest(modelOptionName(selectedModel));
    const generationMode = resolveImageEditMode(capability, Boolean(mask));
    validateImageCapability(capability, generationMode, references.length, n);
    const seedream = isSeedreamImageModel(requestConfig.model);
    const junliImage = isJunliImageModel(selectedModel) || isJunliImageModel(requestConfig.model);
    if (mask && junliImage) throw new Error("Junli 图片编辑接口不支持蒙版参数，请改用普通图片编辑");
    if (seedream) {
        if (mask) throw new Error("当前 Seedream/SeedEdit 接入暂不支持蒙版编辑");
        const seedreamError = seedreamEditError(requestConfig.model, references.length);
        if (seedreamError) throw new Error(seedreamError);
        return requestSeedreamImages(requestConfig, requestPrompt, references, n, config.resolution || config.quality, config.size, generationMode, capability, options);
    }
    if (requestConfig.apiFormat === "gemini") {
        if (mask) throw new Error("Gemini 调用格式暂不支持蒙版编辑");
        try {
            return await requestGeminiImages(requestConfig, requestPrompt, references, n, options);
        } catch (error) {
            throw new Error(readAxiosError(error, "请求失败"));
        }
    }
    const quality = requestQuality(config.quality, capability);
    const resolution = normalizeResolution(config.resolution || config.quality);
    const requestSize = resolveImageRequestSize(selectedModel, resolution, config.size);
    if (isAgnesImageModel(requestConfig.model)) {
        if (mask) throw new Error("Agnes 图像接口暂不支持蒙版编辑");
        return requestAgnesImages(requestConfig, withSystemPrompt(requestConfig, requestPrompt), references, n, requestSize, options);
    }
    const responseFormat = requestedImageResponseFormat(config, requestConfig.model);
    const formData = new FormData();
    formData.set("model", requestConfig.model);
    formData.set("prompt", withSystemPrompt(requestConfig, requestPrompt));
    if (!junliImage) formData.set("n", String(n));
    if (responseFormat) formData.set("response_format", responseFormat);
    if (!junliImage && !seedream && quality) {
        formData.set("quality", quality);
    }
    if (requestSize) {
        formData.set("size", requestSize);
    }
    const files = await Promise.all(references.map(imageToFile));
    files.forEach((file) => formData.append("image", file));
    if (mask) formData.set("mask", dataUrlToFile(mask));

    try {
        const url = aiApiUrl(requestConfig, "/images/edits");
        const response = await axios.post<ImageApiResponse>(url, formData, { headers: { ...aiHeaders(requestConfig), ...durableGenerationHeaders(url, options?.jobId) }, signal: options?.signal, timeout: IMAGE_GENERATION_TIMEOUT_MS });
        const images = parseImagePayload(response.data, requestConfig.useProxy);
        return images;
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
}

async function requestAgnesImages(config: AiConfig, prompt: string, references: ReferenceImage[], n: number, size: string | undefined, options?: RequestOptions) {
    try {
        const images = await Promise.all(references.map((image) => agnesReferenceImageInput(image, options?.signal)));
        const body: Record<string, unknown> = {
            model: config.model,
            prompt,
            n,
            ...(size ? { size } : {}),
        };
        if (images.length) body.image = images.length === 1 ? images[0] : images;
        const url = aiApiUrl(config, "/images/generations");
        const response = await axios.post<ImageApiResponse>(url, body, { headers: { ...aiHeaders(config, "application/json"), ...durableGenerationHeaders(url, options?.jobId) }, signal: options?.signal, timeout: IMAGE_GENERATION_TIMEOUT_MS });
        return parseImagePayload(response.data, config.useProxy);
    } catch (error) {
        throw new Error(readAgnesImageError(error, size));
    }
}

async function agnesReferenceImageInput(image: ReferenceImage, signal?: AbortSignal) {
    const directUrl = image.url || "";
    if (isPublicImageUrl(directUrl)) return directUrl;

    const token = useUserStore.getState().token;
    if (token.trim()) {
        try {
            const file = await imageToFile(image);
            const publicUrl = await uploadImageToCurrentBackend(token, file, image.name || file.name || "reference.png");
            if (isPublicImageUrl(publicUrl)) return publicUrl;
        } catch {
            // Agnes supports base64 for image-to-image, so backend public URL upload is only an optimization.
        }
    }

    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return imageToDataUrl(image);
}

function isPublicImageUrl(url: string) {
    if (!/^https?:\/\//i.test(url)) return false;
    try {
        const host = new URL(url).hostname.toLowerCase();
        return host !== "localhost" && host !== "127.0.0.1" && host !== "::1";
    } catch {
        return false;
    }
}

function readAgnesImageError(error: unknown, size: string | undefined) {
    const message = readAxiosError(error, "请求失败");
    if (axios.isAxiosError(error) && error.response?.status === 500) {
        return `${message}。Agnes 500 通常是请求参数异常；当前 size=${size || "auto"}，图生图参考图已按公网 URL/base64 传给 image 字段。`;
    }
    return message;
}

async function requestSeedreamImages(config: AiConfig, prompt: string, references: ReferenceImage[], n: number, resolution: string, size: string, mode: ImageGenerationMode, capability: ImageModelCapability | null, options?: RequestOptions) {
    try {
        const requestSize = resolveSeedreamSize(config.model, normalizeResolution(resolution), size);
        const responseFormat = requestedImageResponseFormat(config, config.model);
        const imageUrls = await Promise.all(references.map((image) => imageToDataUrl(image)));
        const url = aiApiUrl(config, "/images/generations");
        const response = await axios.post<ImageApiResponse>(
            url,
            {
                model: config.model,
                prompt: withSystemPrompt(config, prompt),
                image: imageUrls.length === 1 ? imageUrls[0] : imageUrls,
                ...imageOutputCountPayload(capability, n),
                ...(capability ? { _flowcanvas_mode: mode } : {}),
                ...(requestSize ? { size: requestSize } : {}),
                ...(responseFormat ? { response_format: responseFormat } : {}),
                ...(responseFormat === "b64_json" && seedreamSupportsOutputFormat(config.model) ? { output_format: IMAGE_OUTPUT_FORMAT } : {}),
            },
            { headers: { ...aiHeaders(config, "application/json"), ...durableGenerationHeaders(url, options?.jobId) }, signal: options?.signal, timeout: IMAGE_GENERATION_TIMEOUT_MS },
        );
        return parseImagePayload(response.data, config.useProxy);
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
}

function resolveImageEditMode(capability: ImageModelCapability | null, hasMask: boolean): ImageGenerationMode {
    if (hasMask) return "image-edit";
    if (!capability || capability.modes.includes("image-to-image")) return "image-to-image";
    return capability.modes.includes("image-edit") ? "image-edit" : "image-to-image";
}

function validateImageCapability(capability: ImageModelCapability | null, mode: ImageGenerationMode, inputCount: number, outputCount: number) {
    if (!capability) return;
    if (!capability.modes.includes(mode)) throw new Error(`当前模型不支持${imageModeLabel(mode)}`);
    if (capability.counts.length && !capability.counts.includes(outputCount)) {
        throw new Error(`当前模型仅支持生成 ${capability.counts.join(" / ")} 张图片`);
    }
    if (inputCount > capability.maxImages) {
        throw new Error(`当前模型最多支持 ${capability.maxImages} 张参考图片`);
    }
    if (capability.maxOutputs > 0 && outputCount > capability.maxOutputs) {
        throw new Error(`当前模型单次最多生成 ${capability.maxOutputs} 张图片`);
    }
    if (capability.maxTotalImages > 0 && inputCount + outputCount > capability.maxTotalImages) {
        throw new Error(`当前模型输入与输出图片总数不能超过 ${capability.maxTotalImages} 张`);
    }
}

function imageOutputCountPayload(capability: ImageModelCapability | null, count: number) {
    if (!capability?.sequentialImageGeneration) return { n: count };
    if (count <= 1) return { n: 1, sequential_image_generation: "disabled" };
    return {
        sequential_image_generation: "auto",
        sequential_image_generation_options: { max_images: count },
    };
}

function imageModeLabel(mode: ImageGenerationMode) {
    if (mode === "text-to-image") return "文生图";
    if (mode === "image-to-image") return "图生图";
    return "图像编辑";
}

export async function requestImageQuestion(config: AiConfig, messages: AiTextMessage[], onDelta: (text: string) => void, options?: RequestOptions) {
    const requestConfig = resolveModelRequestConfig(config, config.model || config.textModel);
    try {
        if (requestConfig.apiFormat === "gemini") {
            const answer = (await requestGeminiStreamingResponse(requestConfig, toGeminiBody(requestConfig, messages), onDelta, options)).content || "没有返回内容";
            if (answer === "没有返回内容") onDelta(answer);
            return answer;
        }
        const answer =
            (
                await requestStreamingChatCompletion(
                    requestConfig,
                    {
                        model: requestConfig.model,
                        messages: toChatMessages(withSystemMessage(requestConfig, messages)),
                    },
                    onDelta,
                    options,
                )
            ).content || "没有返回内容";
        if (answer === "没有返回内容") onDelta(answer);
        return answer;
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
}

export async function requestToolResponse(config: AiConfig, messages: ResponseInputMessage[], tools: ResponseFunctionTool[], toolChoice: ToolChoice = "auto", onDelta?: (text: string) => void, options?: RequestOptions): Promise<ToolResponseResult> {
    const requestConfig = resolveModelRequestConfig(config, config.model || config.textModel);
    try {
        if (requestConfig.apiFormat === "gemini") {
            return await requestGeminiStreamingResponse(requestConfig, toGeminiBody(requestConfig, messages, toGeminiToolOptions(tools, toolChoice)), onDelta, options);
        }
        const body = (choice: ToolChoice) => ({
            model: requestConfig.model,
            messages: toChatMessages(withSystemMessage(requestConfig, messages)),
            tools: tools.map(toChatTool),
            tool_choice: toChatToolChoice(choice),
            parallel_tool_calls: false,
        });
        try {
            return await requestStreamingChatCompletion(requestConfig, body(toolChoice), onDelta, options);
        } catch (error) {
            // 部分开启思考模式的模型不支持强制工具调用（tool_choice=required），
            // 返回类似 "Thinking mode does not support this tool_choice" 的错误。
            // 此时降级为 auto 重试一次，让模型自主决定是否调用工具。
            const message = readAxiosError(error, "");
            if (toolChoice === "required" && TOOL_CHOICE_UNSUPPORTED_PATTERN.test(message)) {
                return await requestStreamingChatCompletion(requestConfig, body("auto"), onDelta, options);
            }
            throw error;
        }
    } catch (error) {
        throw new Error(readAxiosError(error, "请求失败"));
    }
}

export async function fetchImageModels(config: Pick<AiConfig, "baseUrl" | "apiKey" | "apiFormat" | "useProxy">) {
    try {
        if (config.apiFormat === "gemini") {
            const response = await axios.get<GeminiPayload>(geminiApiUrl({ ...defaultGeminiConfig, ...config }), { headers: geminiHeaders({ ...defaultGeminiConfig, ...config }), timeout: 15_000 });
            validateGeminiPayload(response.data);
            return (response.data.models || [])
                .map((model) => model.name?.replace(/^models\//, ""))
                .filter((id): id is string => Boolean(id))
                .sort((a, b) => a.localeCompare(b));
        }
        const response = await axios.get<{ data?: Array<{ id?: string }>; error?: { message?: string } }>(buildApiUrl(config.baseUrl, "/models", config.useProxy), {
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
            },
            timeout: 15_000,
        });
        return (response.data.data || [])
            .map((model) => model.id)
            .filter((id): id is string => Boolean(id))
            .sort((a, b) => a.localeCompare(b));
    } catch (error) {
        throw new Error(readAxiosError(error, "读取模型失败"));
    }
}

export async function fetchChannelModels(channel: ModelChannel) {
    return fetchImageModels({ baseUrl: channel.baseUrl, apiKey: channel.apiKey, apiFormat: channel.apiFormat, useProxy: channel.useProxy });
}

const defaultGeminiConfig: Pick<AiConfig, "baseUrl" | "apiKey" | "apiFormat" | "model" | "systemPrompt"> = {
    baseUrl: "https://generativelanguage.googleapis.com",
    apiKey: "",
    apiFormat: "gemini",
    model: "",
    systemPrompt: "",
};
