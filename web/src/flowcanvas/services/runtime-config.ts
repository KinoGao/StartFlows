import { apiUrl } from "@/flowcanvas/constant/env";
import { invalidateAudioModelCapabilities, invalidateImageModelCapabilities, invalidateVideoModelCapabilities } from "@/flowcanvas/services/api/model-capabilities";
import { fetchRuntimeConfig, type RuntimeConfig } from "@/flowcanvas/services/api/platform-admin";
import {
    defaultComfyUiConfig,
    defaultConfig,
    encodeChannelModel,
    modelOptionName,
    normalizeModelOptionValue,
    type AiConfig,
    type ComfyUiConfig,
    type ModelCapability,
    useConfigStore,
} from "@/flowcanvas/stores/use-config-store";

export const RUNTIME_CONFIG_CHANGED_EVENT = "flowcanvas:runtime-config-changed";
const capabilities: ModelCapability[] = ["image", "video", "text", "audio"];

function runtimeCatalog(runtime: RuntimeConfig) {
    const entries = runtime.providers.flatMap((provider) => provider.models.map((model) => {
        const channelId = `${provider.id}:${model.id}`;
        return {
            capability: model.category,
            option: encodeChannelModel(channelId, model.id),
            patterns: Array.from(new Set([model.id, ...model.modelPatterns].map((value) => value.trim()).filter(Boolean))),
            channel: {
                id: channelId,
                name: `${provider.name} · ${model.displayName}`,
                baseUrl: provider.baseUrl.startsWith("/api/") ? apiUrl(provider.baseUrl) : provider.baseUrl || apiUrl(`/api/model-runtime/models/${encodeURIComponent(model.id)}`),
                apiKey: "backend-managed",
                apiFormat: provider.apiFormat,
                models: [model.id],
                modelLabels: { [model.id]: model.displayName },
                modelPatterns: { [model.id]: Array.from(new Set([model.id, ...model.modelPatterns].map((value) => value.trim()).filter(Boolean))) },
                modelRequestNames: { [model.id]: model.upstreamModel || model.id },
                useProxy: false,
            },
        };
    }));
    const channels = entries.map((entry) => entry.channel);
    const modelsByCapability = Object.fromEntries(capabilities.map((capability) => [
        capability,
        entries.filter((entry) => entry.capability === capability).map((entry) => entry.option),
    ])) as Record<ModelCapability, string[]>;
    const defaultByCapability = Object.fromEntries(capabilities.map((capability) => {
        const modelId = runtime.defaultModels?.[capability] || "";
        const entry = entries.find((item) => item.capability === capability && item.channel.models[0] === modelId);
        return [capability, entry?.option || ""];
    })) as Record<ModelCapability, string>;
    const allModels = entries.map((entry) => entry.option);
    return { entries, channels, modelsByCapability, allModels, defaultByCapability };
}

export function reconcileConfigWithRuntime(
    accountConfig: Partial<AiConfig> | null | undefined,
    runtime: RuntimeConfig,
    currentComfyui: ComfyUiConfig = defaultComfyUiConfig,
) {
    const preferences: AiConfig = { ...defaultConfig, ...(accountConfig || {}) };
    const { entries, channels, modelsByCapability, allModels, defaultByCapability } = runtimeCatalog(runtime);
    const choose = (current: string | undefined, capability?: ModelCapability) => {
        const allowedOptions = capability ? modelsByCapability[capability] : allModels;
        // 后台默认模型优先：管理员设置的默认覆盖账号里已有的旧选择；节点级手动选择仍通过
        // normalizeRuntimeModelOption + node.metadata.model 生效。
        const defaultOption = capability ? defaultByCapability[capability] : "";
        if (defaultOption && allowedOptions.includes(defaultOption)) return defaultOption;
        const normalized = normalizeModelOptionValue(current, channels);
        if (allowedOptions.includes(normalized)) return normalized;
        const requestedModel = modelOptionName(current || "").trim();
        const matched = entries.find((entry) =>
            (!capability || entry.capability === capability)
            && entry.patterns.some((pattern) => wildcardMatches(pattern, requestedModel)),
        );
        if (matched) return matched.option;
        return allowedOptions[0] || "";
    };
    const imageModel = choose(preferences.imageModel, "image");
    const videoModel = choose(preferences.videoModel, "video");
    const textModel = choose(preferences.textModel, "text");
    const audioModel = choose(preferences.audioModel, "audio");
    const model = choose(preferences.model) || imageModel || videoModel || textModel || audioModel;

    return {
        config: {
            ...preferences,
            channelMode: "local" as const,
            channels,
            models: allModels,
            imageModels: modelsByCapability.image,
            videoModels: modelsByCapability.video,
            textModels: modelsByCapability.text,
            audioModels: modelsByCapability.audio,
            imageModel,
            videoModel,
            textModel,
            audioModel,
            model,
            baseUrl: channels[0]?.baseUrl || "",
            apiKey: channels.length ? "backend-managed" : "",
            apiFormat: channels[0]?.apiFormat || "openai",
            useProxy: false,
        },
        comfyui: {
            ...defaultComfyUiConfig,
            ...currentComfyui,
            proxyMode: "backend" as const,
            clientId: runtime.comfyui.clientId || "flow-canvas",
            defaultWorkflowId: runtime.comfyui.defaultWorkflowId || "",
            timeoutSeconds: String(runtime.comfyui.timeoutSeconds || 300),
            pollIntervalMs: String(runtime.comfyui.pollIntervalMs || 1200),
        },
    };
}

export function normalizeRuntimeModelOption(config: AiConfig, value: string | undefined, capability?: ModelCapability | "comfyui") {
    const requestedOption = (value || "").trim();
    if (!requestedOption) return "";
    const modelCapability = capability === "comfyui" ? undefined : capability;
    const allowedOptions = modelCapability ? config[`${modelCapability}Models`] : config.models;
    const normalizedOption = normalizeModelOptionValue(requestedOption, config.channels);
    if (!allowedOptions.length) return normalizedOption || requestedOption;
    if (allowedOptions.includes(normalizedOption)) return normalizedOption;
    const requestedModel = modelOptionName(requestedOption).trim();
    for (const channel of config.channels) {
        for (const model of channel.models) {
            const option = encodeChannelModel(channel.id, model);
            if (!allowedOptions.includes(option)) continue;
            const patterns = channel.modelPatterns?.[model] || [model];
            if (patterns.some((pattern) => wildcardMatches(pattern, requestedModel))) return option;
        }
    }
    return "";
}

function wildcardMatches(pattern: string, value: string) {
    const normalizedPattern = pattern.trim().toLowerCase();
    const normalizedValue = value.trim().toLowerCase();
    if (!normalizedPattern || !normalizedValue) return false;
    const escaped = normalizedPattern
        .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(normalizedValue);
}

export async function refreshRuntimeConfig() {
    const runtime = await fetchRuntimeConfig();
    invalidateImageModelCapabilities();
    invalidateVideoModelCapabilities();
    invalidateAudioModelCapabilities();
    const state = useConfigStore.getState();
    useConfigStore.setState(reconcileConfigWithRuntime(state.config, runtime, state.comfyui));
    return runtime;
}

export function notifyRuntimeConfigChanged() {
    window.dispatchEvent(new Event(RUNTIME_CONFIG_CHANGED_EVENT));
}
