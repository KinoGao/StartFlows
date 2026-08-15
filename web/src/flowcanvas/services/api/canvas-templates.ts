import type { CanvasWorkflowTemplate } from "@/flowcanvas/canvas/utils/canvas-workflow-template";
import type { CanvasConnection, CanvasNodeData } from "@/flowcanvas/canvas/types";

/**
 * VOZEB 适配：画布工作流模板暂存 localStorage（VOZEB 没有模板接口）。
 * 后续可映射到 library-assets 或自建表。
 */

export type CanvasTemplateInput = {
    name: string;
    nodes: CanvasNodeData[];
    connections: CanvasConnection[];
};

const STORAGE_KEY = "flowcanvas:canvas-templates";

function readLocal(): CanvasWorkflowTemplate[] {
    if (typeof window === "undefined") return [];
    try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function writeLocal(templates: CanvasWorkflowTemplate[]) {
    if (typeof window !== "undefined") window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

/** 列出当前账号的全部模板 */
export async function listCanvasTemplates(_token: string): Promise<CanvasWorkflowTemplate[]> {
    return readLocal();
}

/** 保存新模板，返回保存后的模板 */
export async function saveCanvasTemplate(_token: string, input: CanvasTemplateInput): Promise<CanvasWorkflowTemplate> {
    const template: CanvasWorkflowTemplate = {
        id: `template-${Date.now()}`,
        name: input.name,
        createdAt: new Date().toISOString(),
        nodes: input.nodes,
        connections: input.connections,
    } as CanvasWorkflowTemplate;
    writeLocal([...readLocal(), template]);
    return template;
}

/** 删除指定模板 */
export async function deleteCanvasTemplate(_token: string, id: string): Promise<void> {
    writeLocal(readLocal().filter((template) => template.id !== id));
}
