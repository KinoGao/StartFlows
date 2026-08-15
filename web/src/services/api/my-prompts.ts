import { ALL_PROMPTS_OPTION, type Prompt, type PromptListResponse } from "./prompts";

export function listMyPrompts(input: { page: number; pageSize?: number; category?: string; keyword?: string; includeFacets?: boolean }) {
    const query = new URLSearchParams({
        page: String(input.page),
        ...(input.pageSize ? { pageSize: String(input.pageSize) } : {}),
        ...(input.category && input.category !== ALL_PROMPTS_OPTION ? { category: input.category } : {}),
        ...(input.keyword?.trim() ? { keyword: input.keyword.trim() } : {}),
        ...(input.includeFacets === false ? { includeFacets: "0" } : {}),
    });
    return request<PromptListResponse>(`/api/my-prompts?${query}`, { cache: "no-store" });
}

export function createMyPrompt(input: { title: string; prompt: string; category?: string; tags?: string[]; coverUrl?: string; preview?: string }) {
    return request<{ prompt: Prompt }>("/api/my-prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
    }).then((data) => data.prompt);
}

export function deleteMyPrompt(id: string) {
    return request<{ ok: boolean }>(`/api/my-prompts/${encodeURIComponent(id)}`, { method: "DELETE" });
}

async function request<T>(url: string, init?: RequestInit) {
    const response = await fetch(url, init);
    const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
    if (!response.ok) throw new Error(payload.error || "提示词请求失败");
    return payload;
}
