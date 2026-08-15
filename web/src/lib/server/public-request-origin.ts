import { getTrustedProxyHops } from "@/lib/server/trusted-proxy";

export function resolvePublicRequestOrigin(request: Request, configuredValue = process.env.NEXT_PUBLIC_SITE_URL || "") {
    const configured = normalizeWebOrigin(configuredValue);
    const requested = requestOrigin(request);

    if (configured && !isLoopbackOrigin(configured)) return configured;
    if (requested && !isLoopbackOrigin(requested)) return requested;
    return requested || configured || "http://localhost:3000";
}

function requestOrigin(request: Request) {
    const requestUrl = parseUrl(request.url);
    if (!requestUrl) return "";

    const trustForwarded = getTrustedProxyHops() > 0;
    const host = (trustForwarded ? firstForwardedValue(request.headers.get("x-forwarded-host")) : "") || request.headers.get("host")?.trim() || requestUrl.host;
    const protocol = (trustForwarded ? firstForwardedValue(request.headers.get("x-forwarded-proto")) : "") || requestUrl.protocol.replace(/:$/, "");
    return normalizeWebOrigin(`${protocol}://${host}`);
}

function firstForwardedValue(value: string | null) {
    return value?.split(",")[0]?.trim() || "";
}

function normalizeWebOrigin(value: string) {
    const parsed = parseUrl(value.trim());
    if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.username || parsed.password) return "";
    return parsed.origin;
}

function isLoopbackOrigin(origin: string) {
    const hostname = parseUrl(origin)
        ?.hostname.toLowerCase()
        .replace(/^\[|\]$/g, "");
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function parseUrl(value: string) {
    try {
        return new URL(value);
    } catch {
        return null;
    }
}
