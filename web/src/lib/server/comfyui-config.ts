import { readJsonDataFile, writeJsonDataFile } from "@/lib/server/data-adapter";

export type ComfyUiPlatformConfig = {
    enabled: boolean;
    baseUrl: string;
    clientId: string;
    defaultWorkflowId: string;
    timeoutSeconds: number;
    pollIntervalMs: number;
};

const FILE_NAME = "comfyui-config.json";

// 默认值迁移自旧 FlowCanvas 后台 platform_config.comfyui
const DEFAULT_CONFIG: ComfyUiPlatformConfig = {
    enabled: true,
    baseUrl: "http://127.0.0.1:8188",
    clientId: "flow-canvas",
    defaultWorkflowId: "",
    timeoutSeconds: 3000,
    pollIntervalMs: 1200,
};

function normalize(input: Partial<ComfyUiPlatformConfig>): ComfyUiPlatformConfig {
    return {
        enabled: typeof input.enabled === "boolean" ? input.enabled : DEFAULT_CONFIG.enabled,
        baseUrl: (typeof input.baseUrl === "string" && input.baseUrl.trim()) || DEFAULT_CONFIG.baseUrl,
        clientId: (typeof input.clientId === "string" && input.clientId.trim()) || DEFAULT_CONFIG.clientId,
        defaultWorkflowId: typeof input.defaultWorkflowId === "string" ? input.defaultWorkflowId : "",
        timeoutSeconds: Math.max(10, Math.floor(Number(input.timeoutSeconds) || DEFAULT_CONFIG.timeoutSeconds)),
        pollIntervalMs: Math.max(200, Math.floor(Number(input.pollIntervalMs) || DEFAULT_CONFIG.pollIntervalMs)),
    };
}

export async function getComfyUiConfig(): Promise<ComfyUiPlatformConfig> {
    return normalize(await readJsonDataFile<Partial<ComfyUiPlatformConfig>>(FILE_NAME, {}));
}

export async function saveComfyUiConfig(input: Partial<ComfyUiPlatformConfig>): Promise<ComfyUiPlatformConfig> {
    const next = normalize({ ...(await getComfyUiConfig()), ...input });
    await writeJsonDataFile(FILE_NAME, next);
    return next;
}

/** 下发给创作端的运行时配置：不含 baseUrl（地址留在服务端，代理强制使用） */
export function runtimeComfyUiConfig(config: ComfyUiPlatformConfig): Omit<ComfyUiPlatformConfig, "baseUrl"> {
    return {
        enabled: config.enabled,
        clientId: config.clientId,
        defaultWorkflowId: config.defaultWorkflowId,
        timeoutSeconds: config.timeoutSeconds,
        pollIntervalMs: config.pollIntervalMs,
    };
}
