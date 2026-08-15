import { compactApiParams, serializeApiParams } from "@/services/api/request";

export type Prompt = {
    id: string;
    scope?: "library" | "user";
    ownerUserId?: string;
    title: string;
    coverUrl: string;
    prompt: string;
    tags: string[];
    category: string;
    githubUrl?: string;
    preview: string;
    createdAt: string;
    updatedAt: string;
};

export const ALL_PROMPTS_OPTION = "全部";

const promptCategoryLabels: Readonly<Record<string, string>> = {
    "UI 与社交媒体": "UI 与社交",
};

export function promptCategoryLabel(category: string) {
    return promptCategoryLabels[category] || category;
}

export type PromptListResponse = {
    items: Prompt[];
    tags: string[];
    categories: string[];
    total: number;
};

export async function fetchPrompts({
    keyword = "",
    tag = [],
    category = ALL_PROMPTS_OPTION,
    page,
    pageSize,
    random = false,
    includeFacets = true,
}: { keyword?: string; tag?: string[]; category?: string; page?: number; pageSize?: number; random?: boolean; includeFacets?: boolean } = {}) {
    const params = serializeApiParams(
        compactApiParams({
            ...(keyword ? { keyword } : {}),
            ...(tag.length ? { tag } : {}),
            ...(category !== ALL_PROMPTS_OPTION ? { category } : {}),
            ...(random ? { random: "1" } : {}),
            ...(page ? { page } : {}),
            ...(pageSize ? { pageSize } : {}),
            ...(!includeFacets ? { includeFacets: "0" } : {}),
        }),
    );
    const response = await fetch(`/api/prompts${params.size ? `?${params}` : ""}`);
    if (!response.ok) throw new Error("获取提示词失败");
    return (await response.json()) as PromptListResponse;
}

export function formatPromptDate(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
