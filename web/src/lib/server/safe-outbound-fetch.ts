import { Agent, fetch as undiciFetch, type Dispatcher } from "undici";

import { GENERATION_TRANSPORT_TIMEOUT_MS } from "@/lib/server/generation-http-lifecycle";
import { connectProxyFetch } from "@/lib/server/proxy-connect-fetch";
import { resolveServerProxyUrl } from "@/lib/server/proxy-dispatcher";
import { hasFakeIpOnlyResolution, isPublicIpAddress, resolveSafeOutboundTarget } from "@/lib/server/outbound-url-security";
import { toUndiciRequestBody } from "@/lib/server/undici-request-body";

type CachedDispatcher = { dispatcher: Dispatcher; lastUsedAt: number };

const MAX_DISPATCHERS = 64;
const DISPATCHER_TTL_MS = 5 * 60_000;
const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const CROSS_ORIGIN_REDIRECT_HEADERS = new Set(["accept", "accept-encoding", "accept-language", "content-language", "content-type", "range"]);
const globalCache = globalThis as typeof globalThis & { __vozebProSafeOutboundDispatchers?: Map<string, CachedDispatcher> };
const dispatchers = (globalCache.__vozebProSafeOutboundDispatchers ??= new Map<string, CachedDispatcher>());

export class UnsafeOutboundUrlError extends Error {
    constructor(message = "出站地址不允许访问") {
        super(message);
        this.name = "UnsafeOutboundUrlError";
    }
}

export async function fetchSafeOutbound(input: string | URL, init: RequestInit = {}, options?: { allowCredentials?: boolean }): Promise<Response> {
    let currentUrl: URL;
    try {
        currentUrl = input instanceof URL ? new URL(input) : new URL(input);
    } catch {
        throw new UnsafeOutboundUrlError();
    }
    let currentInit = { ...init };
    const redirectMode = init.redirect || "follow";
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
        const response = await fetchPinned(currentUrl, { ...currentInit, redirect: "manual" }, options);
        if (!REDIRECT_STATUSES.has(response.status)) return response;
        if (redirectMode === "manual") return response;
        await response.body?.cancel().catch(() => undefined);
        if (redirectMode === "error") throw new UnsafeOutboundUrlError("上游地址不允许重定向");
        const location = response.headers.get("location");
        if (!location || redirects === MAX_REDIRECTS) throw new UnsafeOutboundUrlError("上游重定向地址无效或次数过多");
        let nextUrl: URL;
        try {
            nextUrl = new URL(location, currentUrl);
        } catch {
            throw new UnsafeOutboundUrlError("上游重定向地址无效");
        }
        currentInit = redirectedRequestInit(currentUrl, nextUrl, response.status, currentInit);
        currentUrl = nextUrl;
    }
    throw new UnsafeOutboundUrlError("上游重定向次数过多");
}

async function fetchPinned(input: URL, init: RequestInit, options?: { allowCredentials?: boolean }) {
    const target = await resolveSafeOutboundTarget(input, options);
    if (!target) return fetchViaProxyWhenFakeIp(input, init, options);

    const headers = new Headers(init.headers);
    const proxyUrl = isPublicIpAddress(target.address) ? resolveServerProxyUrl() : "";
    const body = await toUndiciRequestBody(init.body);
    // 代理路径走手动 CONNECT 隧道（undici ProxyAgent 小碎片吞吐瓶颈），直连仍用 undici Agent
    if (proxyUrl) return connectProxyFetch(target.url, { method: init.method, headers, body, signal: init.signal }, proxyUrl);
    const dispatcher = dispatcherFor(target.url, target.address, target.family);
    return (await undiciFetch(target.url, { ...init, body, headers, dispatcher } as import("undici").RequestInit & { dispatcher: Dispatcher })) as unknown as Response;
}

// fake-ip DNS 环境（Clash 等）本地解析只得到保留地址，无法钉住真实 IP；
// 配置了系统代理时代理服务器会解析真实 DNS，仅在这种可识别场景下放行走代理隧道。
async function fetchViaProxyWhenFakeIp(input: URL, init: RequestInit, options?: { allowCredentials?: boolean }) {
    const proxyUrl = resolveServerProxyUrl();
    if (!proxyUrl || !(await hasFakeIpOnlyResolution(input, options))) throw new UnsafeOutboundUrlError();
    const headers = new Headers(init.headers);
    const body = await toUndiciRequestBody(init.body);
    return connectProxyFetch(input, { method: init.method, headers, body, signal: init.signal }, proxyUrl);
}

function redirectedRequestInit(currentUrl: URL, nextUrl: URL, status: number, init: RequestInit): RequestInit {
    const headers = new Headers(init.headers);
    if (currentUrl.origin !== nextUrl.origin) {
        [...headers.keys()].forEach((name) => {
            if (!CROSS_ORIGIN_REDIRECT_HEADERS.has(name.toLowerCase())) headers.delete(name);
        });
    }
    const switchToGet = status === 303 ? init.method?.toUpperCase() !== "HEAD" : (status === 301 || status === 302) && init.method?.toUpperCase() === "POST";
    if (switchToGet) {
        headers.delete("content-length");
        headers.delete("content-type");
        return { ...init, method: "GET", body: undefined, headers };
    }
    return { ...init, headers };
}

function dispatcherFor(url: URL, address: string, family: 4 | 6) {
    // 代理路径已在 fetchPinned 中分流到 connectProxyFetch，这里只处理直连
    const servername = /^\d+(?:\.\d+){3}$/.test(url.hostname) || url.hostname.includes(":") ? undefined : url.hostname;
    const key = [url.protocol, url.host, address, family].join("|");
    const now = Date.now();
    cleanupDispatchers(now);
    const cached = dispatchers.get(key);
    if (cached) {
        cached.lastUsedAt = now;
        return cached.dispatcher;
    }

    const connect = {
        ...(servername ? { servername } : {}),
        lookup: (_hostname: string, optionsOrCallback: unknown, maybeCallback?: (error: Error | null, address: string | Array<{ address: string; family: 4 | 6 }>, family?: 4 | 6) => void) => {
            const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
            if (!callback) return;
            if (typeof optionsOrCallback === "object" && optionsOrCallback && "all" in optionsOrCallback && (optionsOrCallback as { all?: boolean }).all) {
                callback(null, [{ address, family }]);
                return;
            }
            callback(null, address, family);
        },
    };
    const dispatcher: Dispatcher = new Agent({
        connect,
        connectTimeout: 10_000,
        connections: 8,
        keepAliveTimeout: 10_000,
        keepAliveMaxTimeout: 60_000,
        headersTimeout: GENERATION_TRANSPORT_TIMEOUT_MS,
        bodyTimeout: GENERATION_TRANSPORT_TIMEOUT_MS,
    });
    dispatchers.set(key, { dispatcher, lastUsedAt: now });
    cleanupDispatchers(now);
    return dispatcher;
}

function cleanupDispatchers(now: number) {
    for (const [key, cached] of dispatchers) {
        if (now - cached.lastUsedAt <= DISPATCHER_TTL_MS && dispatchers.size <= MAX_DISPATCHERS) continue;
        dispatchers.delete(key);
        void cached.dispatcher.close().catch(() => undefined);
    }
}
