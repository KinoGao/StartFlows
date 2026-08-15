export type WorkCommunitySummary = {
    workId: string;
    versionId: string;
    slug: string;
    ownerUserId: string;
    authorDisplay: "profile" | "custom" | "hidden";
    likeCount: number;
    followerCount: number;
    liked: boolean;
    followingAuthor: boolean;
    canFollow: boolean;
};

export type WorkRelationResult = {
    workId: string;
    versionId: string;
    ownerUserId: string;
    changed: boolean;
    active: boolean;
    likeCount: number;
};

export type CommunityUser = {
    username: string;
    displayName: string;
    bio: string;
    avatarUrl?: string;
    followerCount: number;
    relatedAt: string;
    publicProfileAvailable: boolean;
};

export type CommunityActivitySummary = {
    view: "summary";
    username: string;
    publishedWorkCount: number;
    followingCount: number;
    followerCount: number;
    likedWorkCount: number;
    publicProfileAvailable: boolean;
};

export type CommunityActivityPage = CommunityActivitySummary | ({ view: "following" | "followers"; items: CommunityUser[] } & PageFields) | ({ view: "likes"; items: Array<PublicGalleryItem & { likedAt: string }> } & PageFields);

export type PublicCreatorProfile = {
    username: string;
    displayName: string;
    bio: string;
    avatarUrl?: string;
    publishedWorkCount: number;
    receivedLikeCount: number;
    followerCount: number;
    followingCount: number;
    following: boolean;
    canFollow: boolean;
};

export type PublicCreatorPage = {
    profile: PublicCreatorProfile;
    items: PublicGalleryItem[];
    nextCursor?: string;
};

export type InteractionNotification = {
    id: string;
    type: "work_like" | "user_follow";
    targetPath: string;
    summary: string;
    readAt?: string;
    createdAt: string;
    actor?: { id: string; username?: string; displayName?: string };
};

export type InteractionNotificationPage = { items: InteractionNotification[]; unreadCount: number; nextCursor?: string };

type PageFields = { total: number; page: number; pageSize: number };

export function getWorkCommunity(slug: string) {
    return requestCommunity<WorkCommunitySummary>(`/api/public/works/${encodeURIComponent(slug)}/community`);
}

export function setWorkLike(slug: string, active: boolean) {
    return requestCommunity<WorkRelationResult>(`/api/public/works/${encodeURIComponent(slug)}/community/like`, jsonPost({ active }));
}

export function setWorkAuthorFollow(slug: string, active: boolean) {
    return requestCommunity<{ changed: boolean; active: boolean; followerCount: number }>(`/api/public/works/${encodeURIComponent(slug)}/community/follow`, jsonPost({ active }));
}

export function listCommunityActivity(input: { view: "summary" | "following" | "followers" | "likes"; page?: number; pageSize?: number }) {
    return requestCommunity<CommunityActivityPage>(`/api/community/activity?${searchParams(input)}`);
}

export function getPublicCreatorPage(username: string, input: { limit?: number; cursor?: string } = {}) {
    return requestCommunity<PublicCreatorPage>(`/api/public/users/${encodeURIComponent(username)}?${searchParams(input)}`);
}

export function setPublicCreatorFollow(username: string, active: boolean) {
    return requestCommunity<{ changed: boolean; active: boolean; followerCount: number }>(`/api/public/users/${encodeURIComponent(username)}/follow`, jsonPost({ active }));
}

export function setPublicUserBlock(username: string, active: boolean) {
    return requestCommunity<{ changed: boolean; active: boolean; removedFollowCount: number }>(`/api/public/users/${encodeURIComponent(username)}/block`, jsonPost({ active }));
}

export function listInteractionNotifications(input: { limit?: number; cursor?: string } = {}, signal?: AbortSignal) {
    return requestCommunity<InteractionNotificationPage>(`/api/notifications/interactions?${searchParams(input)}`, { signal });
}

export function markInteractionNotificationRead(id: string) {
    return requestCommunity<{ item: InteractionNotification }>(`/api/notifications/interactions/${encodeURIComponent(id)}/read`, { method: "POST" }).then((data) => data.item);
}

export function markAllInteractionNotificationsRead() {
    return requestCommunity<{ updated: number }>("/api/notifications/interactions/read-all", { method: "POST" });
}

function jsonPost(body: unknown): RequestInit {
    return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function searchParams(input: Record<string, string | number | undefined>) {
    const params = new URLSearchParams();
    Object.entries(input).forEach(([key, value]) => {
        if (value !== undefined && value !== "") params.set(key, String(value));
    });
    return params.toString();
}

async function requestCommunity<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, { cache: "no-store", ...init });
    const payload = (await response.json().catch(() => null)) as { code?: unknown; data?: unknown; msg?: unknown } | null;
    if (!response.ok || !payload || payload.code !== 0 || payload.data === undefined) throw new Error(typeof payload?.msg === "string" ? payload.msg : "请求失败");
    return payload.data as T;
}
import type { PublicGalleryItem } from "./work-governance";
