import { apiUrl } from "@/flowcanvas/constant/env";
import type { CanvasWorkflowTemplate } from "@/flowcanvas/canvas/utils/canvas-workflow-template";
import type { CanvasConnection, CanvasNodeData } from "@/flowcanvas/canvas/types";
import { ApiError, bearerHeaders } from "@/flowcanvas/services/api/auth";

/**
 * 账号级画布工作流模板客户端。
 * 对应后端 CanvasTemplateController（/api/canvas-templates），
 * 响应统一为 { code, data, msg }，code === 0 表示成功。
 */

type ApiEnvelope = { code?: number; data?: unknown; msg?: string };

async function readApi<T>(response: Response): Promise<T> {
    let body: ApiEnvelope | null = null;
    try {
        body = (await response.json()) as ApiEnvelope;
    } catch {
        body = null;
    }
    if (!response.ok || body?.code !== 0) throw new ApiError(body?.msg || `请求失败：${response.status}`, response.status);
    return body.data as T;
}

export type CanvasTemplateInput = {
    name: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

/** 列出当前账号的全部模板 */
export async function listCanvasTemplates(token: string): Promise<CanvasWorkflowTemplate[]> {
    return readApi<CanvasWorkflowTemplate[]>(await fetch(apiUrl("/api/canvas-templates"), { headers: bearerHeaders(token) }));
}

/** 保存新模板（id 由后端生成），返回保存后的模板 */
export async function saveCanvasTemplate(token: string, input: CanvasTemplateInput): Promise<CanvasWorkflowTemplate> {
    return readApi<CanvasWorkflowTemplate>(
        await fetch(apiUrl("/api/canvas-templates"), {
            method: "POST",
            headers: bearerHeaders(token),
            body: JSON.stringify({ name: input.name, nodes: input.nodes, connections: input.connections }),
        }),
    );
}

/** 删除指定模板 */
export async function deleteCanvasTemplate(token: string, id: string): Promise<void> {
    await readApi<void>(
        await fetch(apiUrl(`/api/canvas-templates/${encodeURIComponent(id)}`), {
            method: "DELETE",
            headers: bearerHeaders(token),
        }),
    );
}
