import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    agents: [] as Array<{ options: Record<string, unknown>; close: ReturnType<typeof vi.fn> }>,
    fetch: vi.fn(),
    resolve: vi.fn(),
    isPublic: vi.fn(() => true),
    fakeIpOnly: vi.fn(() => false),
    proxyUrl: vi.fn(() => ""),
    connectProxy: vi.fn(),
}));
vi.mock("undici", () => ({
    Agent: class {
        close = vi.fn(async () => undefined);
        constructor(public options: Record<string, unknown>) {
            mocks.agents.push(this);
        }
    },
    ProxyAgent: class {
        close = vi.fn(async () => undefined);
        constructor(public options: Record<string, unknown>) {
            mocks.agents.push(this);
        }
    },
    fetch: mocks.fetch,
}));
vi.mock("@/lib/server/outbound-url-security", () => ({ hasFakeIpOnlyResolution: mocks.fakeIpOnly, isPublicIpAddress: mocks.isPublic, resolveSafeOutboundTarget: mocks.resolve }));
vi.mock("@/lib/server/proxy-dispatcher", () => ({ resolveServerProxyUrl: mocks.proxyUrl }));
vi.mock("@/lib/server/proxy-connect-fetch", () => ({ connectProxyFetch: mocks.connectProxy }));

import { fetchSafeOutbound, UnsafeOutboundUrlError } from "./safe-outbound-fetch";
import { GENERATION_TRANSPORT_TIMEOUT_MS } from "./generation-http-lifecycle";

describe("safe outbound fetch", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.agents.length = 0;
        mocks.resolve.mockReset();
        mocks.isPublic.mockReturnValue(true);
        mocks.fakeIpOnly.mockReturnValue(false);
        mocks.proxyUrl.mockReturnValue("");
        mocks.fetch.mockResolvedValue(Response.json({ ok: true }));
        mocks.connectProxy.mockResolvedValue(Response.json({ ok: true }));
    });

    it("connects to the validated IP while preserving the original Host and TLS identity", async () => {
        mocks.resolve.mockResolvedValue({ url: new URL("https://provider.example:8443/v1/models?cursor=one"), address: "8.8.8.8", family: 4 });

        await fetchSafeOutbound("https://provider.example:8443/v1/models?cursor=one", { headers: { accept: "application/json" } });

        const [requestUrl, init] = mocks.fetch.mock.calls[0];
        expect(String(requestUrl)).toBe("https://provider.example:8443/v1/models?cursor=one");
        expect(new Headers(init?.headers).get("host")).toBeNull();
        expect((init as RequestInit & { dispatcher?: unknown }).dispatcher).toBeTruthy();
        expect(mocks.agents[0]?.options).toMatchObject({
            headersTimeout: GENERATION_TRANSPORT_TIMEOUT_MS,
            bodyTimeout: GENERATION_TRANSPORT_TIMEOUT_MS,
        });

        const connect = mocks.agents[0]?.options.connect as { servername?: string; lookup?: (hostname: string, options: { all?: boolean }, callback: (error: Error | null, addresses: Array<{ address: string; family: 4 | 6 }>) => void) => void };
        expect(connect.servername).toBe("provider.example");
        let resolved: Array<{ address: string; family: 4 | 6 }> = [];
        connect.lookup?.("provider.example", { all: true }, (_error, addresses) => {
            resolved = addresses;
        });
        expect(resolved).toEqual([{ address: "8.8.8.8", family: 4 }]);
    });

    it("fails before opening a connection when resolution is unsafe", async () => {
        mocks.resolve.mockResolvedValue(null);
        await expect(fetchSafeOutbound("http://127.0.0.1/private")).rejects.toBeInstanceOf(UnsafeOutboundUrlError);
        expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it("connects directly to an explicitly allowed private address", async () => {
        mocks.resolve.mockResolvedValue({ url: new URL("http://private-provider.test/v1/models"), address: "127.0.0.1", family: 4 });
        mocks.isPublic.mockReturnValue(false);
        mocks.proxyUrl.mockReturnValue("http://proxy.test:8080");

        await fetchSafeOutbound("http://private-provider.test/v1/models");

        expect(mocks.proxyUrl).not.toHaveBeenCalled();
        expect(mocks.agents[0]?.options.connect).toBeTruthy();
    });

    it("routes through the manual CONNECT tunnel with the original URL when an outbound proxy is used", async () => {
        mocks.resolve.mockResolvedValue({ url: new URL("https://provider.example/v1/images/generations"), address: "8.8.8.8", family: 4 });
        mocks.proxyUrl.mockReturnValue("http://proxy.test:8080");

        await fetchSafeOutbound("https://provider.example/v1/images/generations");

        expect(mocks.connectProxy).toHaveBeenCalledTimes(1);
        const [targetUrl, , proxyUrl] = mocks.connectProxy.mock.calls[0];
        expect(String(targetUrl)).toBe("https://provider.example/v1/images/generations");
        expect(proxyUrl).toBe("http://proxy.test:8080");
        expect(mocks.fetch).not.toHaveBeenCalled();
    });

    it("lets the proxy resolve DNS when local resolution is fake-ip intercepted", async () => {
        mocks.resolve.mockResolvedValue(null);
        mocks.fakeIpOnly.mockResolvedValue(true);
        mocks.proxyUrl.mockReturnValue("http://127.0.0.1:7890");

        await fetchSafeOutbound("https://provider.example/v1/images/generations", { method: "POST", body: "{}" });

        expect(mocks.connectProxy).toHaveBeenCalledTimes(1);
        const [targetUrl, init, proxyUrl] = mocks.connectProxy.mock.calls[0];
        expect(String(targetUrl)).toBe("https://provider.example/v1/images/generations");
        expect(init?.method).toBe("POST");
        expect(proxyUrl).toBe("http://127.0.0.1:7890");
    });

    it("still rejects unsafe resolution when no proxy is configured or the answers are not fake-ip", async () => {
        mocks.resolve.mockResolvedValue(null);
        await expect(fetchSafeOutbound("https://provider.example/v1/images")).rejects.toBeInstanceOf(UnsafeOutboundUrlError);

        mocks.proxyUrl.mockReturnValue("http://127.0.0.1:7890");
        mocks.fakeIpOnly.mockResolvedValue(false);
        await expect(fetchSafeOutbound("https://provider.example/v1/images")).rejects.toBeInstanceOf(UnsafeOutboundUrlError);
        expect(mocks.connectProxy).not.toHaveBeenCalled();
    });
});
