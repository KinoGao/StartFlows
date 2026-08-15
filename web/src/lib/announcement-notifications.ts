const MAX_READ_ANNOUNCEMENTS = 100;

export function parseAnnouncementReadIds(raw: string | null) {
    if (!raw) return new Set<string>();
    try {
        const value = JSON.parse(raw);
        return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(-MAX_READ_ANNOUNCEMENTS) : []);
    } catch {
        return new Set<string>();
    }
}

export function mergeAnnouncementReadIds(current: ReadonlySet<string>, ids: Iterable<string>) {
    const merged = [...current];
    for (const id of ids) {
        if (!id || current.has(id) || merged.includes(id)) continue;
        merged.push(id);
    }
    return new Set(merged.slice(-MAX_READ_ANNOUNCEMENTS));
}

export function formatAnnouncementTime(value: string, now = Date.now()) {
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return "刚刚";
    const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
    if (minutes < 1) return "刚刚";
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} 天前`;
    return new Date(timestamp).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}
