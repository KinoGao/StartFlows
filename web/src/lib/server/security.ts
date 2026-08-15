import { createHash } from "node:crypto";
import { isIP } from "node:net";

import { ensurePostgresSchema, getDatabaseProvider, postgresQuery } from "@/lib/server/database";
import { getTrustedProxyHops } from "@/lib/server/trusted-proxy";

export { isPublicIpAddress, isSafeOutboundUrl, resolveSafeOutboundTarget } from "@/lib/server/outbound-url-security";
export { getTrustedProxyHops } from "@/lib/server/trusted-proxy";

export type RateLimitConfig = {
    maxRequests: number;
    windowMs: number;
};

export type RateLimitResult = {
    allowed: boolean;
    remaining: number;
    resetAt: number;
};

export type GenerationRateLimitType = "text" | "image" | "video" | "audio" | "agent" | "render";
export type AuthRateLimitDimension = "ip" | "account" | "device" | "global";
export type AuthRateLimitResult = RateLimitResult & { dimension?: AuthRateLimitDimension };

export const AUTH_LOGIN_RATE_LIMIT: RateLimitConfig = { maxRequests: 8, windowMs: 15 * 60 * 1000 };

const generationRateLimits: Record<GenerationRateLimitType, RateLimitConfig> = {
    agent: { maxRequests: 10, windowMs: 60 * 1000 },
    image: { maxRequests: 20, windowMs: 60 * 1000 },
    video: { maxRequests: 6, windowMs: 60 * 1000 },
    audio: { maxRequests: 20, windowMs: 60 * 1000 },
    text: { maxRequests: 30, windowMs: 60 * 1000 },
    render: { maxRequests: 6, windowMs: 60 * 1000 },
};

const mediaProxyRateLimit: RateLimitConfig = { maxRequests: 120, windowMs: 60 * 1000 };
const localMediaRateLimit: RateLimitConfig = { maxRequests: 240, windowMs: 60 * 1000 };
const signedMediaRateLimit: RateLimitConfig = { maxRequests: 60, windowMs: 60 * 1000 };
const publicMediaResourceRateLimit: RateLimitConfig = { maxRequests: 2400, windowMs: 60 * 1000 };
const publicMediaIpRateLimit: RateLimitConfig = { maxRequests: 240, windowMs: 60 * 1000 };

const globalSecurityStore = globalThis as typeof globalThis & {
    __vozebProRateLimits?: Map<string, { count: number; resetAt: number }>;
    __vozebProRateLimitCleanupAt?: number;
};

const rateLimits = (globalSecurityStore.__vozebProRateLimits ??= new Map<string, { count: number; resetAt: number }>());

export function getClientIp(request: Request) {
    const trustedProxyHops = getTrustedProxyHops();
    if (trustedProxyHops <= 0) return "unknown";

    const forwarded = request.headers
        .get("x-forwarded-for")
        ?.split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    if (forwarded?.length) {
        if (forwarded.length < trustedProxyHops) return "unknown";
        return normalizeForwardedIp(forwarded[forwarded.length - trustedProxyHops]) || "unknown";
    }
    if (trustedProxyHops !== 1) return "unknown";
    return normalizeForwardedIp(request.headers.get("x-real-ip")) || normalizeForwardedIp(request.headers.get("cf-connecting-ip")) || "unknown";
}

export async function checkAuthRateLimit(scope: string, request: Request, account: unknown, config: RateLimitConfig): Promise<AuthRateLimitResult> {
    const identities: Array<[AuthRateLimitDimension, string, RateLimitConfig]> = [];
    const ip = getClientIp(request);
    if (ip !== "unknown") identities.push(["ip", ip, config]);
    else identities.push(["global", "unknown-client", { ...config, maxRequests: config.maxRequests * 20 }]);
    const device = authDeviceFingerprint(request);
    const deviceIdentity = device || "anonymous";
    identities.push(["device", deviceIdentity, config]);
    const normalizedAccount = normalizeAuthIdentity(account);
    const accountSource = ip !== "unknown" ? `ip:${ip}` : `device:${deviceIdentity}`;
    if (normalizedAccount) identities.push(["account", `${normalizedAccount}:${accountSource}`, config]);

    let combined: AuthRateLimitResult = { allowed: true, remaining: config.maxRequests, resetAt: Date.now() + config.windowMs };
    for (const [dimension, identity, dimensionConfig] of identities) {
        const result = await checkRateLimit(`auth:${normalizeAuthScope(scope)}:${dimension}:${identity}`, dimensionConfig);
        if (!result.allowed) return { ...result, dimension };
        if (result.remaining < combined.remaining) combined = { ...result, dimension };
    }
    return combined;
}

export async function checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
    const normalized = { maxRequests: Math.max(1, Math.floor(config.maxRequests)), windowMs: Math.max(1000, Math.floor(config.windowMs)) };
    if (getDatabaseProvider() === "postgres") {
        try {
            return await checkPostgresRateLimit(key, normalized);
        } catch {
            return checkMemoryRateLimit(key, normalized);
        }
    }
    return checkMemoryRateLimit(key, normalized);
}

export async function checkGenerationRateLimit(userId: string, request: Request, type: GenerationRateLimitType) {
    const config = generationRateLimits[type];
    const userLimit = await checkRateLimit(`generation:${type}:user:${userId}`, config);
    if (!userLimit.allowed) return userLimit;

    const clientIp = getClientIp(request);
    if (clientIp === "unknown") return userLimit;
    const ipLimit = await checkRateLimit(`generation:${type}:ip:${clientIp}`, { ...config, maxRequests: config.maxRequests * 4 });
    return ipLimit.allowed ? userLimit : ipLimit;
}

export async function checkMediaProxyRateLimit(userId: string, request: Request) {
    const userLimit = await checkRateLimit(`media-proxy:user:${userId}`, mediaProxyRateLimit);
    if (!userLimit.allowed) return userLimit;

    const clientIp = getClientIp(request);
    if (clientIp === "unknown") return userLimit;
    const ipLimit = await checkRateLimit(`media-proxy:ip:${clientIp}`, { ...mediaProxyRateLimit, maxRequests: mediaProxyRateLimit.maxRequests * 4 });
    return ipLimit.allowed ? userLimit : ipLimit;
}

export async function checkLocalMediaRateLimit(identity: string, request: Request) {
    const config = identity.startsWith("signature:") ? signedMediaRateLimit : localMediaRateLimit;
    const identityLimit = await checkRateLimit(`local-media:${identity}`, config);
    if (!identityLimit.allowed) return identityLimit;

    const clientIp = getClientIp(request);
    if (clientIp === "unknown") return identityLimit;
    const ipLimit = await checkRateLimit(`local-media:ip:${clientIp}`, { ...config, maxRequests: config.maxRequests * 4 });
    return ipLimit.allowed ? identityLimit : ipLimit;
}

export async function checkPublicMediaRateLimit(resource: string, request: Request) {
    const resourceLimit = await checkRateLimit(`public-media:resource:${resource}`, publicMediaResourceRateLimit);
    if (!resourceLimit.allowed) return resourceLimit;

    const clientIp = getClientIp(request);
    if (clientIp === "unknown") return resourceLimit;
    const ipLimit = await checkRateLimit(`public-media:ip:${clientIp}`, publicMediaIpRateLimit);
    return ipLimit.allowed ? resourceLimit : ipLimit;
}

export function rateLimitHeaders(result: RateLimitResult) {
    return { "Retry-After": String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))) };
}

async function checkPostgresRateLimit(key: string, config: RateLimitConfig) {
    await ensurePostgresSchema();
    const now = Date.now();
    await cleanupExpiredPostgresRateLimits(now);
    const resetAt = now + config.windowMs;
    const result = await postgresQuery<{ request_count: number | string; reset_at: Date | string }>(
        `INSERT INTO rate_limits (key_hash, request_count, reset_at, updated_at)
         VALUES ($1, 1, $3, $2)
         ON CONFLICT (key_hash) DO UPDATE SET
            request_count = CASE WHEN rate_limits.reset_at <= $2 THEN 1 ELSE LEAST(rate_limits.request_count + 1, $4) END,
            reset_at = CASE WHEN rate_limits.reset_at <= $2 THEN $3 ELSE rate_limits.reset_at END,
            updated_at = $2
         RETURNING request_count, reset_at`,
        [createHash("sha256").update(key).digest("hex"), new Date(now), new Date(resetAt), config.maxRequests + 1],
    );
    const count = Number(result.rows[0]?.request_count) || 1;
    const databaseResetAt = new Date(result.rows[0]?.reset_at || resetAt).getTime();
    return { allowed: count <= config.maxRequests, remaining: Math.max(0, config.maxRequests - count), resetAt: Number.isFinite(databaseResetAt) ? databaseResetAt : resetAt };
}

async function cleanupExpiredPostgresRateLimits(now: number) {
    const lastCleanupAt = globalSecurityStore.__vozebProRateLimitCleanupAt || 0;
    if (now - lastCleanupAt < 5 * 60_000) return;
    globalSecurityStore.__vozebProRateLimitCleanupAt = now;
    await postgresQuery(
        `DELETE FROM rate_limits
         WHERE ctid IN (
             SELECT ctid
             FROM rate_limits
             WHERE reset_at < $1
             ORDER BY reset_at ASC
             LIMIT 500
         )`,
        [new Date(now - 60 * 60_000)],
    );
}

function checkMemoryRateLimit(key: string, config: RateLimitConfig) {
    const now = Date.now();
    const current = rateLimits.get(key);
    if (!current || current.resetAt <= now) {
        const next = { count: 1, resetAt: now + config.windowMs };
        rateLimits.set(key, next);
        cleanupRateLimits(now);
        return { allowed: true, remaining: config.maxRequests - 1, resetAt: next.resetAt };
    }

    if (current.count >= config.maxRequests) {
        return { allowed: false, remaining: 0, resetAt: current.resetAt };
    }

    current.count += 1;
    return { allowed: true, remaining: config.maxRequests - current.count, resetAt: current.resetAt };
}

function cleanupRateLimits(now: number) {
    if (rateLimits.size < 5000) return;
    for (const [key, value] of rateLimits.entries()) {
        if (value.resetAt <= now) rateLimits.delete(key);
    }
}

function normalizeForwardedIp(value: string | null | undefined) {
    const candidate = value?.trim().replace(/^"|"$/g, "") || "";
    return isIP(candidate) ? candidate.toLowerCase() : "";
}

function normalizeAuthIdentity(value: unknown) {
    return typeof value === "string" ? value.normalize("NFKC").trim().toLowerCase().slice(0, 160) : "";
}

function normalizeAuthScope(value: string) {
    return (
        value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9:_-]+/g, "-")
            .slice(0, 64) || "auth"
    );
}

function authDeviceFingerprint(request: Request) {
    const fingerprint = ["user-agent", "accept-language", "sec-ch-ua", "sec-ch-ua-platform", "sec-ch-ua-mobile"].map((name) => request.headers.get(name)?.trim() || "").join("\n");
    return fingerprint.replace(/\n/g, "") ? createHash("sha256").update(fingerprint).digest("hex") : "";
}
