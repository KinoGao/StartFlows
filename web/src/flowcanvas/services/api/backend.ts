import type { ComfyWorkflow, ComfyWorkflowField, ComfyWorkflowJson } from "@/flowcanvas/services/comfyui-workflows";
import { apiUrl } from "@/flowcanvas/constant/env";

function tokenHeaders(token: string): HeadersInit {
    return {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
    };
}

async function blobToDataUrl(blob: Blob): Promise<string | null> {
    if (typeof FileReader === "undefined") return Promise.resolve(null);
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onerror = () => resolve(null);
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
        reader.readAsDataURL(blob);
    });
}

async function uploadImageAsDataUrl(token: string, dataUrl: string): Promise<string> {
    const resp = await fetch(apiUrl("/api/public-image/data"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
    });
    if (!resp.ok) throw new Error(`后端图片上传失败：${resp.status}`);
    const body = await resp.json();
    if (body.code !== 0) throw new Error(body.msg || "后端图片上传失败");
    const publicUrl = body.data?.url;
    if (publicUrl) return publicUrl;
    const filename = body.data?.filename;
    if (!filename) throw new Error("后端未返回图片文件名");
    if (typeof window !== "undefined") return new URL(`/api/public-image/${filename}`, window.location.origin).toString();
    return apiUrl(`/api/public-image/${filename}`);
}

export async function uploadImageToCurrentBackend(token: string, blob: Blob, fileName = "reference.png"): Promise<string> {
    const dataUrl = await blobToDataUrl(blob);
    if (dataUrl) {
        try {
            return await uploadImageAsDataUrl(token, dataUrl);
        } catch (error) {
            // fall back to multipart below if backend has no JSON endpoint yet
        }
    }
    const form = new FormData();
    form.append("file", blob, fileName);
    const resp = await fetch(apiUrl("/api/public-image"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    });
    if (!resp.ok) throw new Error(`后端图片上传失败：${resp.status}`);
    const body = await resp.json();
    if (body.code !== 0) throw new Error(body.msg || "后端图片上传失败");
    const publicUrl = body.data?.url;
    if (publicUrl) return publicUrl;
    const filename = body.data?.filename;
    if (!filename) throw new Error("后端未返回图片文件名");
    if (typeof window !== "undefined") return new URL(`/api/public-image/${filename}`, window.location.origin).toString();
    return apiUrl(`/api/public-image/${filename}`);
}

export async function uploadMediaToCurrentBackend(token: string, blob: Blob, fileName: string): Promise<string> {
    const form = new FormData();
    form.append("file", blob, fileName);
    const resp = await fetch(apiUrl("/api/public-image"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
    });
    if (!resp.ok) throw new Error(`Backend media upload failed: ${resp.status}`);
    const body = await resp.json();
    if (body.code !== 0) throw new Error(body.msg || "Backend media upload failed");
    const publicUrl = body.data?.url;
    if (publicUrl) return publicUrl;
    const filename = body.data?.filename;
    if (!filename) throw new Error("Backend did not return a media filename");
    if (typeof window !== "undefined") return new URL(`/api/public-image/${filename}`, window.location.origin).toString();
    return apiUrl(`/api/public-image/${filename}`);
}

export async function fetchBackendWorkflows(token: string): Promise<ComfyWorkflow[]> {
    if (!token.trim()) return [];
    const resp = await fetch(apiUrl("/api/workflows"), { headers: tokenHeaders(token) });
    if (!resp.ok) throw new Error(`拉取工作流列表失败：${resp.status}`);
    const body = await resp.json();
    if (body.code !== 0) throw new Error(body.msg || "拉取工作流列表失败");
    return (body.data || []) as ComfyWorkflow[];
}

export async function uploadBackendWorkflow(token: string, name: string, workflow: ComfyWorkflowJson): Promise<ComfyWorkflow> {
    const resp = await fetch(apiUrl("/api/workflows/upload"), {
        method: "POST",
        headers: tokenHeaders(token),
        body: JSON.stringify({ name, workflow }),
    });
    if (!resp.ok) throw new Error(`上传工作流失败：${resp.status}`);
    const body = await resp.json();
    if (body.code !== 0) throw new Error(body.msg || "上传工作流失败");
    return body.data as ComfyWorkflow;
}

export async function pushBackendWorkflowConfig(token: string, id: string, config: { title: string; fields: ComfyWorkflowField[] }): Promise<void> {
    const resp = await fetch(apiUrl(`/api/workflows/${encodeURIComponent(id)}/config`), {
        method: "PUT",
        headers: tokenHeaders(token),
        body: JSON.stringify(config),
    });
    if (!resp.ok) throw new Error(`保存工作流配置失败：${resp.status}`);
    const body = await resp.json();
    if (body.code !== 0) throw new Error(body.msg || "保存工作流配置失败");
}

export async function deleteBackendWorkflow(token: string, id: string): Promise<void> {
    const resp = await fetch(apiUrl(`/api/workflows/${id}`), {
        method: "DELETE",
        headers: tokenHeaders(token),
    });
    if (!resp.ok) throw new Error(`删除远程工作流失败：${resp.status}`);
    const body = await resp.json();
    if (body.code !== 0) throw new Error(body.msg || "删除远程工作流失败");
}
