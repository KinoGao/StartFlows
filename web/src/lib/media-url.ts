const ABSOLUTE_OR_SPECIAL_URL_RE = /^[a-z][a-z\d+.-]*:/i;

export function resolveGeneratedMediaUrl(value: string, baseUrl?: string | null) {
    const mediaUrl = value.trim();
    if (!mediaUrl) return mediaUrl;
    if (ABSOLUTE_OR_SPECIAL_URL_RE.test(mediaUrl)) return rewriteInternalAbsoluteMediaUrl(mediaUrl, baseUrl);

    const base = parseBaseUrl(baseUrl);
    if (!base) return mediaUrl;

    try {
        // Leading-slash result URLs belong to the upstream API host, not the app host.
        if (mediaUrl.startsWith("/")) return new URL(mediaUrl, base.origin).toString();
        return new URL(mediaUrl, directoryBaseUrl(base)).toString();
    } catch {
        return mediaUrl;
    }
}

function rewriteInternalAbsoluteMediaUrl(mediaUrl: string, baseUrl?: string | null) {
    if (!/^https?:\/\//i.test(mediaUrl)) return mediaUrl;

    const base = parseBaseUrl(baseUrl);
    if (!base || (base.protocol !== "http:" && base.protocol !== "https:")) return mediaUrl;

    try {
        const parsed = new URL(mediaUrl);
        if (!isInternalMediaHost(parsed.hostname)) return mediaUrl;
        parsed.protocol = base.protocol;
        parsed.host = base.host;
        return parsed.toString();
    } catch {
        return mediaUrl;
    }
}

function isInternalMediaHost(hostname: string) {
    const host = hostname.toLowerCase();
    return !host || !host.includes(".") || host.endsWith(".internal") || host.endsWith(".local");
}

function parseBaseUrl(baseUrl?: string | null) {
    const value = baseUrl?.trim();
    if (!value) return null;
    try {
        return new URL(value);
    } catch {
        if (typeof window === "undefined") return null;
        try {
            return new URL(value, window.location.origin);
        } catch {
            return null;
        }
    }
}

function directoryBaseUrl(url: URL) {
    if (url.pathname.endsWith("/")) return url.toString();
    const next = new URL(url.toString());
    next.pathname = next.pathname.replace(/\/[^/]*$/, "/");
    next.search = "";
    next.hash = "";
    return next.toString();
}
