export type WorkGovernanceCaseType = "report" | "appeal";
export type WorkGovernanceCaseStatus = "open" | "approved" | "rejected";

export type WorkGovernanceCase = {
    id: string;
    workId: string;
    versionId: string;
    submitterUserId: string;
    caseType: WorkGovernanceCaseType;
    category: string;
    description: string;
    status: WorkGovernanceCaseStatus;
    resolution?: string;
    handledByUserId?: string;
    handledAt?: string;
    createdAt: string;
    updatedAt: string;
    slug?: string;
    title?: string;
    ownerUserId?: string;
    ownerUsername?: string;
    ownerDisplayName?: string;
    ownerAccountId?: string;
    submitterUsername?: string;
    submitterDisplayName?: string;
    submitterAccountId?: string;
};

export type PublicGalleryItem = {
    slug: string;
    sourceType: "media" | "canvas" | "drama";
    viewCount: number;
    likeCount: number;
    isFeatured: boolean;
    publishedAt: string;
    title: string;
    description: string;
    publicPrompt: string;
    category: string;
    tags: string[];
    authorName?: string;
    authorUsername?: string;
    authorAvatarUrl?: string;
    preview?: { id: string; mediaType: "image" | "video" | "audio"; mimeType: string; url: string };
};

export type WorkGovernanceCasePage = { items: WorkGovernanceCase[]; total: number; page: number; pageSize: number };

export type PublicGalleryPage = { items: PublicGalleryItem[]; nextCursor?: string };

export function listPublicGallery(input: { category?: string; limit?: number; sort?: "random" | "featured" | "latest" | "popular" } = {}) {
    return request<PublicGalleryPage>(`/api/public/gallery?${searchParams(input)}`);
}

export function submitWorkReport(slug: string, input: { category: string; description: string }) {
    return request<{ item: WorkGovernanceCase }>(`/api/public/works/${encodeURIComponent(slug)}/report`, jsonRequest(input)).then((data) => data.item);
}

export function submitWorkAppeal(workId: string, input: { versionId: string; description: string }) {
    return request<{ item: WorkGovernanceCase }>(`/api/works/${encodeURIComponent(workId)}/appeal`, jsonRequest(input)).then((data) => data.item);
}

export function listWorkAppeals(workId: string, input: { page?: number; pageSize?: number } = {}) {
    return request<WorkGovernanceCasePage>(`/api/works/${encodeURIComponent(workId)}/appeal?${searchParams(input)}`);
}

export function listAdminWorkCases(input: { page?: number; pageSize?: number; caseType?: WorkGovernanceCaseType; status?: WorkGovernanceCaseStatus; keyword?: string } = {}) {
    return request<WorkGovernanceCasePage>(`/api/admin/work-cases?${searchParams(input)}`);
}

export function resolveAdminWorkCase(id: string, input: { decision: "approved" | "rejected"; resolution: string }) {
    return request<{ item: WorkGovernanceCase }>(`/api/admin/work-cases/${encodeURIComponent(id)}/resolve`, jsonRequest(input)).then((data) => data.item);
}

export function setAdminWorkFeatured(id: string, featured: boolean) {
    return request<{ work: unknown }>(`/api/admin/works/${encodeURIComponent(id)}/feature`, jsonRequest({ featured }));
}

function searchParams(input: Record<string, string | number | undefined>) {
    const params = new URLSearchParams();
    Object.entries(input).forEach(([key, value]) => {
        if (value !== undefined && value !== "") params.set(key, String(value));
    });
    return params.toString();
}

function jsonRequest(body: unknown): RequestInit {
    return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { cache: "no-store", ...init });
    const payload = (await response.json().catch(() => null)) as { code?: unknown; data?: unknown; msg?: unknown } | null;
    if (!response.ok || !payload || payload.code !== 0 || payload.data === undefined) throw new Error(typeof payload?.msg === "string" ? payload.msg : "请求失败");
    return payload.data as T;
}
