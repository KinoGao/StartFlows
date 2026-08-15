export type PublicAnnouncement = {
    id: string;
    title: string;
    content: string;
    enabled: boolean;
    popupHome: boolean;
    popupAfterLogin: boolean;
    startsAt?: string;
    endsAt?: string;
    createdAt: string;
    updatedAt: string;
};

export async function fetchAnnouncements(signal?: AbortSignal) {
    const response = await fetch("/api/announcements", { cache: "no-store", signal });
    if (!response.ok) throw new Error("公告加载失败");
    return parseAnnouncementsPayload(await response.json());
}

export function parseAnnouncementsPayload(payload: unknown): PublicAnnouncement[] {
    if (!isRecord(payload) || !Array.isArray(payload.announcements)) throw new Error("公告数据格式错误");
    return payload.announcements.flatMap((item) => {
        if (!isRecord(item) || typeof item.id !== "string" || typeof item.title !== "string" || typeof item.content !== "string" || typeof item.createdAt !== "string") return [];
        return [
            {
                id: item.id,
                title: item.title,
                content: item.content,
                enabled: item.enabled === true,
                popupHome: item.popupHome === true,
                popupAfterLogin: item.popupAfterLogin === true,
                startsAt: typeof item.startsAt === "string" ? item.startsAt : undefined,
                endsAt: typeof item.endsAt === "string" ? item.endsAt : undefined,
                createdAt: item.createdAt,
                updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : item.createdAt,
            },
        ];
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}
