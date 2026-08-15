export type WorkPublicationSourceType = "media" | "canvas" | "drama";
export type WorkPublicationLifecycleStatus = "active" | "revoked";
export type WorkPublicationVisibility = "private" | "unlisted" | "public";
export type WorkPublicationModerationStatus = "draft" | "pending" | "approved" | "rejected" | "taken_down";
export type WorkPublicationAuthorDisplay = "profile" | "custom" | "hidden";
export type WorkPublicationMediaType = "image" | "video" | "audio";

export type WorkPublicationVersion = {
    id: string;
    workId: string;
    versionNumber: number;
    title: string;
    description: string;
    publicPrompt: string;
    category: string;
    tags: string[];
    visibility: WorkPublicationVisibility;
    authorDisplay: WorkPublicationAuthorDisplay;
    authorName?: string;
    moderationStatus: WorkPublicationModerationStatus;
    rejectionReason?: string;
    submittedAt?: string;
    reviewedAt?: string;
    reviewedByUserId?: string;
    moderationProvider?: string;
    moderationSignal?: unknown;
    createdAt: string;
    updatedAt: string;
};

export type WorkPublicationAsset = {
    id: string;
    versionId: string;
    storageKey: string;
    mediaType: WorkPublicationMediaType;
    mimeType: string;
    role: "cover" | "content";
    sortOrder: number;
    metadata: unknown;
    createdAt: string;
    previewUrl?: string;
};

export type WorkPublication = {
    id: string;
    ownerUserId: string;
    ownerUsername?: string;
    ownerDisplayName?: string;
    ownerAccountId?: string;
    slug: string;
    sourceType: WorkPublicationSourceType;
    sourceId: string;
    lifecycleStatus: WorkPublicationLifecycleStatus;
    currentVersionId?: string;
    publishedVersionId?: string;
    isFeatured: boolean;
    featuredAt?: string;
    featuredByUserId?: string;
    currentVersion?: WorkPublicationVersion;
    publishedVersion?: WorkPublicationVersion;
    currentPreview?: WorkPublicationAsset;
    currentAssets?: WorkPublicationAsset[];
    publishedAssets?: WorkPublicationAsset[];
    viewCount: number;
    likeCount: number;
    lastViewedAt?: string;
    revokedAt?: string;
    createdAt: string;
    updatedAt: string;
};

export type WorkPublicationSourceSummary = {
    id: string;
    title: string;
    kind?: WorkPublicationMediaType;
    updatedAt: string;
};

export type WorkPublicationSourcePage = {
    items: WorkPublicationSourceSummary[];
    total: number;
    page: number;
    pageSize: number;
};

export type WorkPublicationMediaCandidate = {
    storageKey: string;
    mediaType: WorkPublicationMediaType;
    mimeType: string;
    originalName: string;
    bytes: number;
    previewUrl: string;
};

export type WorkPublicationSource = {
    sourceType: WorkPublicationSourceType;
    sourceId: string;
    title: string;
    suggestedPrompt: string;
    candidates: WorkPublicationMediaCandidate[];
};

export type WorkPublicationDraftInput = {
    sourceType: WorkPublicationSourceType;
    sourceId: string;
    title: string;
    description: string;
    publicPrompt: string;
    category: string;
    tags: string[];
    visibility: WorkPublicationVisibility;
    authorDisplay: WorkPublicationAuthorDisplay;
    authorName?: string;
    coverStorageKey?: string;
    assetStorageKeys: string[];
};

export type WorkPublicationPage = {
    items: WorkPublication[];
    total: number;
    page: number;
    pageSize: number;
};

export type PublicWorkPublication = {
    id: string;
    slug: string;
    sourceType: WorkPublicationSourceType;
    viewCount: number;
    likeCount: number;
    publishedAt: string;
    title: string;
    description: string;
    publicPrompt: string;
    category: string;
    tags: string[];
    visibility: WorkPublicationVisibility;
    authorName?: string;
    authorUsername?: string;
    authorAvatarUrl?: string;
    assets: Array<{
        id: string;
        mediaType: WorkPublicationMediaType;
        mimeType: string;
        role: "cover" | "content";
        sortOrder: number;
        metadata: unknown;
        url: string;
    }>;
};

export function listWorkPublications(input: { page?: number; pageSize?: number; status?: WorkPublicationModerationStatus; keyword?: string } = {}) {
    return requestWorkPublication<WorkPublicationPage>(`/api/works?${searchParams(input)}`);
}

export function getWorkPublication(id: string) {
    return requestWorkPublication<{ work: WorkPublication }>(`/api/works/${encodeURIComponent(id)}`).then((data) => data.work);
}

export function listWorkPublicationSources(input: { sourceType: WorkPublicationSourceType; page?: number; pageSize?: number; keyword?: string }) {
    return requestWorkPublication<WorkPublicationSourcePage>(`/api/works/sources?${searchParams(input)}`);
}

export function getWorkPublicationSource(sourceType: WorkPublicationSourceType, sourceId: string) {
    const params = new URLSearchParams({ sourceType, sourceId });
    return requestWorkPublication<{ source: WorkPublicationSource }>(`/api/works/sources?${params}`).then((data) => data.source);
}

export function getPublicWorkPublication(slug: string) {
    return requestWorkPublication<{ work: PublicWorkPublication }>(`/api/public/works/${encodeURIComponent(slug)}`).then((data) => data.work);
}

export function recordPublicWorkPublicationView(slug: string) {
    return requestWorkPublication<{ viewCount: number }>(`/api/public/works/${encodeURIComponent(slug)}/view`, { method: "POST" }).then((data) => data.viewCount);
}

export function createWorkPublication(input: WorkPublicationDraftInput) {
    return requestWorkPublication<{ work: WorkPublication }>("/api/works", jsonRequest("POST", input)).then((data) => data.work);
}

export function updateWorkPublication(id: string, input: WorkPublicationDraftInput) {
    return requestWorkPublication<{ work: WorkPublication }>(`/api/works/${encodeURIComponent(id)}`, jsonRequest("PATCH", input)).then((data) => data.work);
}

export function submitWorkPublication(id: string) {
    return requestWorkPublication<{ work: WorkPublication }>(`/api/works/${encodeURIComponent(id)}/submit`, { method: "POST" }).then((data) => data.work);
}

export function revokeWorkPublication(id: string) {
    return requestWorkPublication<{ work: WorkPublication }>(`/api/works/${encodeURIComponent(id)}/revoke`, { method: "POST" }).then((data) => data.work);
}

export function relistWorkPublication(id: string) {
    return requestWorkPublication<{ work: WorkPublication }>(`/api/works/${encodeURIComponent(id)}/relist`, { method: "POST" }).then((data) => data.work);
}

export function deleteWorkPublication(id: string) {
    return requestWorkPublication<{ deletedId: string }>(`/api/works/${encodeURIComponent(id)}`, { method: "DELETE" }).then((data) => data.deletedId);
}

export function listAdminWorkPublications(input: { page?: number; pageSize?: number; status?: WorkPublicationModerationStatus; lifecycleStatus?: WorkPublicationLifecycleStatus; keyword?: string } = {}) {
    return requestWorkPublication<WorkPublicationPage>(`/api/admin/works?${searchParams(input)}`);
}

export function reviewAdminWorkPublication(id: string, input: { versionId: string; decision: "approved" | "rejected"; reason?: string }) {
    return requestWorkPublication<{ work: WorkPublication }>(`/api/admin/works/${encodeURIComponent(id)}/review`, jsonRequest("POST", input)).then((data) => data.work);
}

export function takeDownAdminWorkPublication(id: string, reason: string) {
    return requestWorkPublication<{ work: WorkPublication }>(`/api/admin/works/${encodeURIComponent(id)}/take-down`, jsonRequest("POST", { reason })).then((data) => data.work);
}

export function deleteAdminWorkPublication(id: string) {
    return requestWorkPublication<{ deletedId: string }>(`/api/admin/works/${encodeURIComponent(id)}`, { method: "DELETE" }).then((data) => data.deletedId);
}

function searchParams(input: Record<string, string | number | undefined>) {
    const params = new URLSearchParams();
    Object.entries(input).forEach(([key, value]) => {
        if (value !== undefined && value !== "") params.set(key, String(value));
    });
    return params.toString();
}

function jsonRequest(method: "POST" | "PATCH", body: unknown): RequestInit {
    return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

async function requestWorkPublication<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { cache: "no-store", ...init });
    const payload = (await response.json().catch(() => null)) as { code?: unknown; data?: unknown; msg?: unknown } | null;
    if (!response.ok || !payload || payload.code !== 0 || payload.data === undefined) throw new Error(typeof payload?.msg === "string" ? payload.msg : "请求失败");
    return payload.data as T;
}
