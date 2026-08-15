const SENSITIVE_QUERY_KEY = /^(?:api[-_]?key|access[-_]?token|auth(?:orization)?|password|secret|signature|sig|token|key)$/i;

export function safeProtocolDocumentationUrl(value: unknown) {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
        const url = new URL(value.trim());
        if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) return "";
        if (Array.from(url.searchParams.keys()).some((key) => SENSITIVE_QUERY_KEY.test(key))) return "";
        return url.toString();
    } catch {
        return "";
    }
}

export function redactProtocolUrlSecrets(value: string) {
    return value.replace(/([?&](?:api[-_]?key|access[-_]?token|auth(?:orization)?|password|secret|signature|sig|token|key)=)[^&#\s"'\\]+/gi, "$1[REDACTED]");
}
