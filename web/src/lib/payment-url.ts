export function safePaymentHttpUrl(value: string | undefined, options: { baseUrl?: string; production?: boolean } = {}) {
    const text = value?.trim();
    if (!text) return "";
    try {
        const url = new URL(text, options.baseUrl);
        if (url.username || url.password) return "";
        const production = options.production ?? process.env.NODE_ENV === "production";
        if (url.protocol === "https:") return url.toString();
        if (url.protocol === "http:" && (!production || isLoopbackHost(url.hostname))) return url.toString();
        return "";
    } catch {
        return "";
    }
}

function isLoopbackHost(hostname: string) {
    const normalized = hostname.toLowerCase();
    return normalized === "localhost" || normalized.endsWith(".localhost") || normalized === "127.0.0.1" || normalized === "[::1]";
}
