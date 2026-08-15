import { apiUrl } from "@/flowcanvas/constant/env";

/** Agent Run 服务端接口（/api/agent-runs）：run 与任务状态以后端为准，前端轮询同步。 */

export type BackendAgentRunTask = {
    id: string;
    nodeId: string;
    type: "text" | "image" | "video" | "audio";
    title: string;
    prompt: string;
    modelId: string;
    dependencies: string[];
    params: Record<string, unknown>;
    status: string;
    attempts: number;
    error?: string;
    upstreamTaskId?: string;
    result?: { content?: string; storageKey?: string; extraStorageKeys?: string[]; mimeType?: string; bytes?: number };
};

export type BackendAgentRun = {
    id: string;
    projectId: string;
    title: string;
    requirement: string;
    status: string;
    plan: unknown;
    tasks: BackendAgentRunTask[];
    createdAt: number;
    updatedAt: number;
};

async function readApi<T>(response: Response): Promise<T> {
    let body: { code?: number; data?: unknown; msg?: string } | null = null;
    try {
        body = (await response.json()) as { code?: number; data?: unknown; msg?: string };
    } catch {
        body = null;
    }
    if (!response.ok || body?.code !== 0) throw new Error(body?.msg || `请求失败：${response.status}`);
    return body.data as T;
}

function headers(token: string): HeadersInit {
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export async function createAgentRun(token: string, payload: { id: string; projectId: string; title: string; requirement: string; plan: unknown; tasks: unknown[] }): Promise<BackendAgentRun> {
    return readApi(await fetch(apiUrl("/api/agent-runs"), { method: "POST", headers: headers(token), body: JSON.stringify(payload) }));
}

export async function fetchAgentRuns(token: string, projectId: string): Promise<BackendAgentRun[]> {
    return readApi(await fetch(apiUrl(`/api/agent-runs?projectId=${encodeURIComponent(projectId)}`), { headers: headers(token) }));
}

export async function fetchAgentRun(token: string, id: string): Promise<BackendAgentRun> {
    return readApi(await fetch(apiUrl(`/api/agent-runs/${encodeURIComponent(id)}`), { headers: headers(token) }));
}

export async function agentRunAction(token: string, id: string, action: "pause" | "resume" | "cancel"): Promise<BackendAgentRun> {
    return readApi(await fetch(apiUrl(`/api/agent-runs/${encodeURIComponent(id)}/${action}`), { method: "POST", headers: headers(token) }));
}

export async function retryAgentRunTask(token: string, id: string, taskId: string): Promise<BackendAgentRun> {
    return readApi(await fetch(apiUrl(`/api/agent-runs/${encodeURIComponent(id)}/tasks/${encodeURIComponent(taskId)}/retry`), { method: "POST", headers: headers(token) }));
}
