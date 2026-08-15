import { apiUrl } from "@/flowcanvas/constant/env";
import { ApiError } from "@/flowcanvas/services/api/auth";
import type { ComfyWorkflow, ComfyWorkflowField, ComfyWorkflowJson } from "@/flowcanvas/services/comfyui-workflows";

export type PlatformProvider = {
    id: string;
    name: string;
    baseUrl: string;
    apiKey: string;
    apiFormat: "openai" | "gemini";
    modelsPath: string;
    enabled: boolean;
};

export type ModelCategory = "text" | "image" | "video" | "audio";
export type ModelVerificationStatus = "unverified" | "verified" | "failed";
export type ModelProtocol = { id: string; name: string; description: string };

export type TextCapabilities = {
    modes: Array<"text" | "vision">;
};

export type ImageCapabilities = {
    modes: Array<"text-to-image" | "image-to-image" | "image-edit">;
    qualities: Array<"low" | "standard" | "high">;
    resolutions: Array<"1k" | "2k" | "3k" | "4k">;
    ratios: string[];
    counts: number[];
    maxImages: number;
    maxOutputs: number;
    maxTotalImages: number;
    sequentialImageGeneration: boolean;
    interactiveEdit: boolean;
    watermark: boolean;
    documentationUrl: string;
    officialTemplate: string;
};

export type VideoCapabilities = {
    modes: Array<"text-to-video" | "all-in-one-reference" | "image-to-video" | "first-last-frame" | "image-reference" | "multi-frame">;
    ratios: string[];
    resolutions: string[];
    durations: number[];
    frameRates: number[];
    counts: number[];
    generateAudio: boolean;
    watermark: boolean;
    draft: boolean;
    maxImages: number;
    maxVideos: number;
    maxAudios: number;
};

export type AudioCapabilities = {
    modes: Array<"text-to-speech">;
    voices: string[];
    formats: string[];
    speeds: number[];
    instructions: boolean;
};

export type PlatformModel = {
    id: string;
    providerId: string;
    displayName: string;
    requestModel: string;
    category: ModelCategory;
    requestAdapter: string;
    enabled: boolean;
    published: boolean;
    modelPatterns: string[];
    verificationStatus: ModelVerificationStatus;
    verifiedAt: string;
    verificationMessage: string;
    textCapabilities: TextCapabilities | null;
    imageCapabilities: ImageCapabilities | null;
    videoCapabilities: VideoCapabilities | null;
    audioCapabilities: AudioCapabilities | null;
};

export type PlatformComfyUi = {
    enabled: boolean;
    baseUrl: string;
    clientId: string;
    defaultWorkflowId: string;
    timeoutSeconds: number;
    pollIntervalMs: number;
};

/** 后台为各分类设置的默认模型 ID（空串 = 不设置）。 */
export type PlatformDefaultModels = {
    text: string;
    image: string;
    video: string;
    audio: string;
};

export type PlatformConfigDocument = {
    providers: PlatformProvider[];
    models: PlatformModel[];
    comfyui: PlatformComfyUi;
    defaultModels: PlatformDefaultModels;
};

export type RuntimeModel = Omit<PlatformModel, "providerId" | "requestModel" | "enabled" | "published" | "verificationStatus" | "verifiedAt" | "verificationMessage"> & {
    /** 上游真实模型名（VOZEB 逻辑模型 binding.upstreamModel） */
    upstreamModel?: string;
};
export type RuntimeProvider = {
    id: string;
    name: string;
    baseUrl: string;
    apiFormat: "openai" | "gemini";
    models: RuntimeModel[];
};
export type RuntimeConfig = {
    providers: RuntimeProvider[];
    comfyui: Omit<PlatformComfyUi, "baseUrl">;
    defaultModels: PlatformDefaultModels;
};

export type AdminProjectSummary = {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
};

export type AdminUserWorkspace = {
    id: string;
    username: string;
    displayName: string;
    role: "USER" | "ADMIN";
    createdAt: string;
    updatedAt: string;
    projectCount: number;
    activeProjectCount: number;
    assetCount: number;
    fileCount: number;
    fileBytes: number;
    projects: AdminProjectSummary[];
};

export type AdminWorkspaceSummary = { users: AdminUserWorkspace[] };
export type AdminProjectDetail = AdminProjectSummary & { userId: string; project: unknown };

export type ModelRequestLogEntry = {
    id: string;
    userId: string | null;
    modelId: string | null;
    method: string;
    path: string;
    requestKind: string | null;
    durationMs: number;
    statusCode: number;
    errorMessage: string | null;
    jobKey: string | null;
    createdAt: string;
};

export type ModelRequestLogPage = {
    content: ModelRequestLogEntry[];
    totalElements: number;
    totalPages: number;
    number: number;
    size: number;
};

type ApiEnvelope<T> = { code: number; data: T; msg?: string };

async function readApi<T>(response: Response): Promise<T> {
    let body: ApiEnvelope<T> | null = null;
    try { body = (await response.json()) as ApiEnvelope<T>; } catch { body = null; }
    if (!response.ok || body?.code !== 0) throw new ApiError(body?.msg || `请求失败：${response.status}`, response.status);
    return body.data;
}

function adminHeaders(authCode: string): HeadersInit {
    return { Authorization: "Bearer " + authCode.trim(), "Content-Type": "application/json" };
}

type VozebSessionSettings = {
    logicalModels?: Array<{
        id: string;
        name: string;
        capability: ModelCategory;
        enabled: boolean;
        bindings?: Array<{ channelId: string; upstreamModel?: string; enabled: boolean; priority?: number }>;
    }>;
    systemChannels?: Array<{ id: string; name: string; baseUrl: string; apiFormat: string; enabled: boolean }>;
    defaultModels?: { imageModel?: string; videoModel?: string; textModel?: string; audioModel?: string };
};

/**
 * VOZEB 适配：模型目录从 /api/auth/session 的 settings 合成 RuntimeConfig。
 * 逻辑模型 → RuntimeModel（category=capability），渠道 → /api/ai/system/<channelId> 透传代理。
 */
export async function fetchRuntimeConfig() {
    // 注意：/api/auth/session 是平铺 JSON（非 {code,data} 信封）
    const body = (await (await fetch(apiUrl("/api/auth/session"))).json()) as { settings?: VozebSessionSettings };
    const settings = body?.settings ?? {};
    const channels = (settings.systemChannels ?? []).filter((channel) => channel.enabled);
    const channelById = new Map(channels.map((channel) => [channel.id, channel]));
    const providers: RuntimeProvider[] = [];
    for (const logical of settings.logicalModels ?? []) {
        if (!logical.enabled) continue;
        const binding = [...(logical.bindings ?? [])].filter((item) => item.enabled).sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))[0];
        const channel = binding ? channelById.get(binding.channelId) : undefined;
        if (!channel) continue;
        providers.push({
            id: `${channel.id}:${logical.id}`,
            name: channel.name,
            baseUrl: channel.baseUrl,
            apiFormat: channel.apiFormat === "gemini" ? "gemini" : "openai",
            models: [
                {
                    id: logical.id,
                    displayName: logical.name || logical.id,
                    category: logical.capability,
                    requestAdapter: channel.apiFormat === "gemini" ? "gemini" : "openai",
                    upstreamModel: binding.upstreamModel || logical.id,
                    modelPatterns: [],
                    textCapabilities: null,
                    imageCapabilities: null,
                    videoCapabilities: null,
                    audioCapabilities: null,
                },
            ],
        });
    }
    const defaults = settings.defaultModels ?? {};
    const runtime: RuntimeConfig = {
        providers,
        comfyui: { enabled: false, clientId: "", defaultWorkflowId: "", timeoutSeconds: 0, pollIntervalMs: 0 },
        defaultModels: {
            text: defaults.textModel ?? "",
            image: defaults.imageModel ?? "",
            video: defaults.videoModel ?? "",
            audio: defaults.audioModel ?? "",
        },
    };
    return runtime;
}

export async function fetchPlatformConfig(authCode: string) {
    return readApi<PlatformConfigDocument>(await fetch(apiUrl("/api/admin/platform-config"), { headers: adminHeaders(authCode) }));
}

export async function fetchModelProtocols(authCode: string) {
    return readApi<ModelProtocol[]>(await fetch(apiUrl("/api/admin/model-protocols"), { headers: adminHeaders(authCode) }));
}

export async function savePlatformConfig(authCode: string, config: PlatformConfigDocument) {
    return readApi<PlatformConfigDocument>(
        await fetch(apiUrl("/api/admin/platform-config"), { method: "PUT", headers: adminHeaders(authCode), body: JSON.stringify(config) }),
    );
}

export async function fetchAdminWorkspaces(authCode: string) {
    return readApi<AdminWorkspaceSummary>(await fetch(apiUrl("/api/admin/workspaces"), { headers: adminHeaders(authCode) }));
}

export async function discoverProviderModels(authCode: string, providerId: string) {
    return readApi<string[]>(
        await fetch(apiUrl("/api/admin/providers/" + encodeURIComponent(providerId) + "/discover-models"), {
            method: "POST",
            headers: adminHeaders(authCode),
        }),
    );
}

export async function verifyPlatformModel(authCode: string, modelId: string) {
    return readApi<PlatformConfigDocument>(
        await fetch(apiUrl("/api/admin/models/" + encodeURIComponent(modelId) + "/verify"), {
            method: "POST",
            headers: adminHeaders(authCode),
        }),
    );
}

export async function fetchAdminProject(authCode: string, userId: string, projectId: string) {
    return readApi<AdminProjectDetail>(
        await fetch(apiUrl("/api/admin/workspaces/" + encodeURIComponent(userId) + "/projects/" + encodeURIComponent(projectId)), {
            headers: adminHeaders(authCode),
        }),
    );
}

export async function updateAdminUser(token: string, userId: string, input: { username: string; displayName: string; role: "USER" | "ADMIN" }) {
    return readApi<AdminUserWorkspace>(
        await fetch(apiUrl("/api/admin/users/" + encodeURIComponent(userId)), {
            method: "PUT", headers: adminHeaders(token), body: JSON.stringify(input),
        }),
    );
}

export async function resetAdminUserPassword(token: string, userId: string, password: string) {
    await readApi<void>(await fetch(apiUrl("/api/admin/users/" + encodeURIComponent(userId) + "/password"), {
        method: "PUT", headers: adminHeaders(token), body: JSON.stringify({ password }),
    }));
}

export async function deleteAdminUser(token: string, userId: string) {
    await readApi<void>(await fetch(apiUrl("/api/admin/users/" + encodeURIComponent(userId)), {
        method: "DELETE", headers: adminHeaders(token),
    }));
}

export async function deleteAdminProject(token: string, userId: string, projectId: string) {
    await readApi<void>(await fetch(apiUrl("/api/admin/users/" + encodeURIComponent(userId) + "/projects/" + encodeURIComponent(projectId)), {
        method: "DELETE", headers: adminHeaders(token),
    }));
}

export async function fetchPublishedWorkflows() {
    return readApi<ComfyWorkflow[]>(await fetch(apiUrl("/api/workflows")));
}

export async function uploadAdminWorkflow(authCode: string, name: string, workflow: ComfyWorkflowJson) {
    return readApi<ComfyWorkflow>(
        await fetch(apiUrl("/api/workflows/upload"), {
            method: "POST",
            headers: adminHeaders(authCode),
            body: JSON.stringify({ name, workflow }),
        }),
    );
}

export async function saveAdminWorkflowConfig(authCode: string, id: string, config: { title: string; fields: ComfyWorkflowField[]; capability?: string }) {
    return readApi<ComfyWorkflow>(
        await fetch(apiUrl("/api/workflows/" + encodeURIComponent(id) + "/config"), {
            method: "PUT",
            headers: adminHeaders(authCode),
            body: JSON.stringify(config),
        }),
    );
}

export async function deleteAdminWorkflow(authCode: string, id: string) {
    await readApi<null>(
        await fetch(apiUrl("/api/workflows/" + encodeURIComponent(id)), { method: "DELETE", headers: adminHeaders(authCode) }),
    );
}

export async function fetchModelRequestLogs(
    authCode: string,
    params: { modelId?: string; statusCode?: number; onlyErrors?: boolean; page?: number; size?: number } = {},
) {
    const query = new URLSearchParams();
    if (params.modelId) query.set("modelId", params.modelId);
    if (params.statusCode !== undefined) query.set("statusCode", String(params.statusCode));
    if (params.onlyErrors) query.set("onlyErrors", "true");
    query.set("page", String(params.page || 0));
    query.set("size", String(params.size || 50));
    return readApi<ModelRequestLogPage>(await fetch(apiUrl("/api/admin/model-request-logs?" + query.toString()), { headers: adminHeaders(authCode) }));
}
