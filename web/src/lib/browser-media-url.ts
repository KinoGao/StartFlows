export function browserReadableMediaUrl(url: string) {
    const value = (url || "").trim();
    if (!value || !/^https?:\/\//i.test(value)) return value;
    if (typeof window === "undefined") return value;

    try {
        const target = new URL(value);
        if (target.origin === window.location.origin) return value;
        return `/api/media-proxy?url=${encodeURIComponent(value)}`;
    } catch {
        return value;
    }
}

export function isRemoteMediaUrl(url: string) {
    return /^https?:\/\//i.test((url || "").trim());
}
