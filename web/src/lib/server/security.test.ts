import { describe, expect, it, vi } from "vitest";
import { checkAuthRateLimit, checkGenerationRateLimit, checkLocalMediaRateLimit, checkMediaProxyRateLimit, checkPublicMediaRateLimit, checkRateLimit, getClientIp, isSafeOutboundUrl, rateLimitHeaders } from "./security";

describe("checkRateLimit", () => {
    it("blocks requests beyond the configured window limit", async () => {
        const key = `test:${crypto.randomUUID()}`;
        expect((await checkRateLimit(key, { maxRequests: 2, windowMs: 60_000 })).allowed).toBe(true);
        expect((await checkRateLimit(key, { maxRequests: 2, windowMs: 60_000 })).allowed).toBe(true);
        expect((await checkRateLimit(key, { maxRequests: 2, windowMs: 60_000 })).allowed).toBe(false);
    });

    it("only trusts the configured number of proxy hops", () => {
        const previous = process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS;
        delete process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS;
        expect(getClientIp(new Request("http://localhost", { headers: { "x-forwarded-for": "198.51.100.10" } }))).toBe("unknown");

        process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS = "2";
        expect(getClientIp(new Request("http://localhost", { headers: { "x-forwarded-for": "198.51.100.10, 203.0.113.10, 192.0.2.10" } }))).toBe("203.0.113.10");

        if (previous === undefined) delete process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS;
        else process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS = previous;
    });

    it("rejects incomplete or malformed trusted proxy chains", () => {
        const previous = process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS;
        try {
            process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS = "2";
            expect(getClientIp(new Request("http://localhost", { headers: { "x-forwarded-for": "198.51.100.10" } }))).toBe("unknown");
            expect(getClientIp(new Request("http://localhost", { headers: { "x-forwarded-for": "attacker, 203.0.113.10" } }))).toBe("unknown");
            expect(getClientIp(new Request("http://localhost", { headers: { "x-real-ip": "198.51.100.10" } }))).toBe("unknown");
        } finally {
            if (previous === undefined) delete process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS;
            else process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS = previous;
        }
    });

    it("does not let attempts from a different source lock the same account", async () => {
        const previous = process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS;
        process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS = "1";
        try {
            const accountScope = `login-account-${crypto.randomUUID()}`;
            for (let index = 0; index < 2; index += 1) {
                const request = new Request("http://localhost", { headers: { "x-forwarded-for": `203.0.113.${index + 1}`, "user-agent": `browser-${index}` } });
                expect((await checkAuthRateLimit(accountScope, request, "same-account", { maxRequests: 2, windowMs: 60_000 })).allowed).toBe(true);
            }
            const differentSource = await checkAuthRateLimit(accountScope, new Request("http://localhost", { headers: { "x-forwarded-for": "203.0.113.20", "user-agent": "browser-third" } }), "same-account", {
                maxRequests: 2,
                windowMs: 60_000,
            });
            expect(differentSource.allowed).toBe(true);

            const repeatedRequest = new Request("http://localhost", { headers: { "x-forwarded-for": "192.0.2.44", "user-agent": "same-source" } });
            expect((await checkAuthRateLimit(accountScope, repeatedRequest, "victim-account", { maxRequests: 2, windowMs: 60_000 })).allowed).toBe(true);
            expect((await checkAuthRateLimit(accountScope, repeatedRequest, "victim-account", { maxRequests: 2, windowMs: 60_000 })).allowed).toBe(true);
            const accountBlocked = await checkAuthRateLimit(accountScope, repeatedRequest, "victim-account", { maxRequests: 2, windowMs: 60_000 });
            expect(accountBlocked.allowed).toBe(false);

            const deviceScope = `login-device-${crypto.randomUUID()}`;
            for (let index = 0; index < 2; index += 1) {
                const request = new Request("http://localhost", { headers: { "x-forwarded-for": `198.51.100.${index + 1}`, "user-agent": "same-browser", "accept-language": "zh-CN" } });
                expect((await checkAuthRateLimit(deviceScope, request, `account-${index}`, { maxRequests: 2, windowMs: 60_000 })).allowed).toBe(true);
            }
            const deviceBlocked = await checkAuthRateLimit(deviceScope, new Request("http://localhost", { headers: { "x-forwarded-for": "198.51.100.20", "user-agent": "same-browser", "accept-language": "zh-CN" } }), "account-third", {
                maxRequests: 2,
                windowMs: 60_000,
            });
            expect(deviceBlocked).toMatchObject({ allowed: false, dimension: "device" });
        } finally {
            if (previous === undefined) delete process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS;
            else process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS = previous;
        }
    });

    it("still limits headerless authentication attempts without trusted proxy headers", async () => {
        const previous = process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS;
        delete process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS;
        try {
            const scope = `login-anonymous-${crypto.randomUUID()}`;
            const request = new Request("http://localhost");
            expect((await checkAuthRateLimit(scope, request, "target", { maxRequests: 2, windowMs: 60_000 })).allowed).toBe(true);
            expect((await checkAuthRateLimit(scope, request, "target", { maxRequests: 2, windowMs: 60_000 })).allowed).toBe(true);
            expect((await checkAuthRateLimit(scope, request, "target", { maxRequests: 2, windowMs: 60_000 })).allowed).toBe(false);
        } finally {
            if (previous === undefined) delete process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS;
            else process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS = previous;
        }
    });

    it("applies a bounded global fallback when account and device headers rotate", async () => {
        const previous = process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS;
        delete process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS;
        try {
            const scope = `login-global-${crypto.randomUUID()}`;
            for (let index = 0; index < 40; index += 1) {
                const request = new Request("http://localhost", { headers: { "user-agent": `rotating-browser-${index}` } });
                expect((await checkAuthRateLimit(scope, request, `account-${index}`, { maxRequests: 2, windowMs: 60_000 })).allowed).toBe(true);
            }
            const blocked = await checkAuthRateLimit(scope, new Request("http://localhost", { headers: { "user-agent": "last-browser" } }), "last-account", {
                maxRequests: 2,
                windowMs: 60_000,
            });
            expect(blocked).toMatchObject({ allowed: false, dimension: "global" });
        } finally {
            if (previous === undefined) delete process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS;
            else process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS = previous;
        }
    });

    it("limits generation requests by user", async () => {
        const userId = `user:${crypto.randomUUID()}`;
        for (let index = 0; index < 6; index += 1) expect((await checkGenerationRateLimit(userId, new Request("http://localhost"), "video")).allowed).toBe(true);
        expect((await checkGenerationRateLimit(userId, new Request("http://localhost"), "video")).allowed).toBe(false);
    });

    it("limits generation requests across users sharing an IP", async () => {
        const previous = process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS;
        process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS = "1";
        const clientIp = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
        try {
            for (let index = 0; index < 24; index += 1) {
                const request = new Request("http://localhost", { headers: { "x-forwarded-for": clientIp } });
                expect((await checkGenerationRateLimit(`user:${crypto.randomUUID()}`, request, "video")).allowed).toBe(true);
            }
            const blocked = await checkGenerationRateLimit(`user:${crypto.randomUUID()}`, new Request("http://localhost", { headers: { "x-forwarded-for": clientIp } }), "video");
            expect(blocked.allowed).toBe(false);
        } finally {
            if (previous === undefined) delete process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS;
            else process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS = previous;
        }
    });

    it("limits repeated media proxy access", async () => {
        const userId = `media:${crypto.randomUUID()}`;
        for (let index = 0; index < 120; index += 1) expect((await checkMediaProxyRateLimit(userId, new Request("http://localhost"))).allowed).toBe(true);
        expect((await checkMediaProxyRateLimit(userId, new Request("http://localhost"))).allowed).toBe(false);
    });

    it("limits repeated local media access", async () => {
        const identity = `local-media:${crypto.randomUUID()}`;
        for (let index = 0; index < 240; index += 1) expect((await checkLocalMediaRateLimit(identity, new Request("http://localhost"))).allowed).toBe(true);
        expect((await checkLocalMediaRateLimit(identity, new Request("http://localhost"))).allowed).toBe(false);
    });

    it("uses a stricter limit for leaked signed media urls", async () => {
        const identity = `signature:${crypto.randomUUID()}`;
        for (let index = 0; index < 60; index += 1) expect((await checkLocalMediaRateLimit(identity, new Request("http://localhost"))).allowed).toBe(true);
        expect((await checkLocalMediaRateLimit(identity, new Request("http://localhost"))).allowed).toBe(false);
    });

    it("does not make normal hotspot reads share the per-IP public limit when proxy headers are untrusted", async () => {
        const previous = process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS;
        delete process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS;
        try {
            const resource = `public:${crypto.randomUUID()}`;
            for (let index = 0; index < 241; index += 1) expect((await checkPublicMediaRateLimit(resource, new Request("http://localhost"))).allowed).toBe(true);
        } finally {
            if (previous === undefined) delete process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS;
            else process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS = previous;
        }
    });

    it("limits a trusted client IP across different public resources", async () => {
        const previous = process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS;
        process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS = "1";
        const clientIp = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
        try {
            for (let index = 0; index < 240; index += 1) {
                const request = new Request("http://localhost", { headers: { "x-forwarded-for": clientIp } });
                expect((await checkPublicMediaRateLimit(`public:${crypto.randomUUID()}`, request)).allowed).toBe(true);
            }
            const blocked = await checkPublicMediaRateLimit(`public:${crypto.randomUUID()}`, new Request("http://localhost", { headers: { "x-forwarded-for": clientIp } }));
            expect(blocked.allowed).toBe(false);
        } finally {
            if (previous === undefined) delete process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS;
            else process.env.VOZEB_PRO_TRUSTED_PROXY_HOPS = previous;
        }
    });

    it("returns a Retry-After header in seconds", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-07-22T00:00:00.000Z"));
        expect(rateLimitHeaders({ allowed: false, remaining: 0, resetAt: Date.now() + 1500 })).toEqual({ "Retry-After": "2" });
        vi.useRealTimers();
    });

    it("allows private upstreams only through an explicit exact host allowlist", async () => {
        vi.stubEnv("VOZEB_PRO_ALLOW_PRIVATE_UPSTREAMS", "");
        vi.stubEnv("VOZEB_PRO_PRIVATE_UPSTREAM_HOSTS", "");
        await expect(isSafeOutboundUrl("http://127.0.0.1:4010/v1/models")).resolves.toBe(false);

        vi.stubEnv("VOZEB_PRO_ALLOW_PRIVATE_UPSTREAMS", "1");
        await expect(isSafeOutboundUrl("http://127.0.0.1:4010/v1/models")).resolves.toBe(false);

        vi.stubEnv("VOZEB_PRO_PRIVATE_UPSTREAM_HOSTS", "127.0.0.1, provider.internal");
        await expect(isSafeOutboundUrl("http://127.0.0.1:4010/v1/models")).resolves.toBe(true);
        await expect(isSafeOutboundUrl("http://127.0.0.2:4010/v1/models")).resolves.toBe(false);
        await expect(isSafeOutboundUrl("ftp://127.0.0.1/file")).resolves.toBe(false);
        await expect(isSafeOutboundUrl("http://user:secret@127.0.0.1/file")).resolves.toBe(false);

        vi.stubEnv("NODE_ENV", "production");
        await expect(isSafeOutboundUrl("http://127.0.0.1:4010/v1/models")).resolves.toBe(true);
        vi.unstubAllEnvs();
    });
});
