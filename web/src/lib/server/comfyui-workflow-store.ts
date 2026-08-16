import { randomUUID } from "node:crypto";
import { readdir, rm } from "node:fs/promises";

import { ensureDataDirectory, readJsonDataFile, resolveDataPath, writeJsonDataFile } from "@/lib/server/data-adapter";

/** ComfyUI 工作流库（移植自旧 Spring WorkflowService，单文件存储：.data/workflows/<id>.json） */

export type StoredComfyWorkflow = {
    id: string;
    name: string;
    title: string;
    capability?: string;
    workflow: Record<string, unknown>;
    fields: unknown[];
    createdAt: string;
    updatedAt: string;
};

const DIR_NAME = "workflows";

function workflowFileName(id: string) {
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safeId) throw new Error("无效的工作流 ID");
    return `${DIR_NAME}/${safeId}.json`;
}

export async function listComfyWorkflows(): Promise<StoredComfyWorkflow[]> {
    await ensureDataDirectory(DIR_NAME);
    const entries = await readdir(resolveDataPath(DIR_NAME));
    const workflows = await Promise.all(
        entries
            .filter((name) => name.endsWith(".json"))
            .map((name) => readJsonDataFile<StoredComfyWorkflow | null>(`${DIR_NAME}/${name}`, null).catch(() => null)),
    );
    return workflows.filter((item): item is StoredComfyWorkflow => Boolean(item && item.id && item.workflow)).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getComfyWorkflow(id: string): Promise<StoredComfyWorkflow | null> {
    return readJsonDataFile<StoredComfyWorkflow | null>(workflowFileName(id), null).catch(() => null);
}

export async function createComfyWorkflow(name: string, workflow: Record<string, unknown>): Promise<StoredComfyWorkflow> {
    const now = new Date().toISOString();
    const safeName = name.trim().slice(0, 120) || "未命名工作流";
    const stored: StoredComfyWorkflow = {
        id: randomUUID().replaceAll("-", "").slice(0, 24),
        name: safeName,
        title: safeName,
        capability: "",
        workflow,
        fields: [],
        createdAt: now,
        updatedAt: now,
    };
    await ensureDataDirectory(DIR_NAME);
    await writeJsonDataFile(workflowFileName(stored.id), stored);
    return stored;
}

export async function updateComfyWorkflowConfig(id: string, config: { title?: string; fields?: unknown[]; capability?: string }): Promise<StoredComfyWorkflow | null> {
    const existing = await getComfyWorkflow(id);
    if (!existing) return null;
    const next: StoredComfyWorkflow = {
        ...existing,
        title: (config.title ?? existing.title).trim().slice(0, 120) || existing.title,
        fields: Array.isArray(config.fields) ? config.fields : existing.fields,
        capability: typeof config.capability === "string" ? config.capability : existing.capability,
        updatedAt: new Date().toISOString(),
    };
    await writeJsonDataFile(workflowFileName(id), next);
    return next;
}

export async function deleteComfyWorkflow(id: string): Promise<boolean> {
    const existing = await getComfyWorkflow(id);
    if (!existing) return false;
    await rm(resolveDataPath(workflowFileName(id)), { force: true });
    return true;
}
