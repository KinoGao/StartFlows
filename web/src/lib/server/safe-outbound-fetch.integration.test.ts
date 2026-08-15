import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), proxyUrl: vi.fn(() => "") }));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("@/lib/server/proxy-dispatcher", () => ({ resolveServerProxyUrl: mocks.proxyUrl }));

import { fetchSafeOutbound, UnsafeOutboundUrlError } from "./safe-outbound-fetch";

describe("safe outbound fetch TCP pinning", () => {
    beforeEach(() => {
        vi.stubEnv("VOZEB_PRO_ALLOW_PRIVATE_UPSTREAMS", "1");
        vi.stubEnv("VOZEB_PRO_PRIVATE_UPSTREAM_HOSTS", "provider.internal");
        mocks.lookup.mockImplementation(async (hostname: string) => (hostname === "provider.internal" ? [{ address: "127.0.0.1", family: 4 }] : [{ address: "10.0.0.8", family: 4 }]));
    });

    afterEach(() => {
        vi.unstubAllEnvs();
        vi.clearAllMocks();
    });

    it("connects to the validated IP while sending the original Host header", async () => {
        let receivedHost = "";
        const server = createServer((request, response) => {
            receivedHost = request.headers.host || "";
            response.setHeader("content-type", "application/json");
            response.end(JSON.stringify({ ok: true }));
        });
        await listen(server);
        const port = (server.address() as AddressInfo).port;
        try {
            const response = await fetchSafeOutbound(`http://provider.internal:${port}/probe`);
            await expect(response.json()).resolves.toEqual({ ok: true });
            expect(receivedHost).toBe(`provider.internal:${port}`);
        } finally {
            await close(server);
        }
    });

    it("serializes native multipart fields and files for the pinned undici request", async () => {
        let contentType = "";
        let receivedBody = "";
        const server = createServer(async (request, response) => {
            contentType = request.headers["content-type"] || "";
            const chunks: Buffer[] = [];
            for await (const chunk of request) chunks.push(Buffer.from(chunk));
            receivedBody = Buffer.concat(chunks).toString("utf8");
            response.end("ok");
        });
        await listen(server);
        const port = (server.address() as AddressInfo).port;
        const nativeForm = new FormData();
        nativeForm.set("model", "e2e-video-slow");
        nativeForm.set("input_reference", new File([new Uint8Array([1, 2, 3])], "reference.png", { type: "image/png" }));
        const form = Object.assign(Object.create(null) as object, { entries: () => nativeForm.entries() }) as unknown as FormData;
        try {
            const response = await fetchSafeOutbound(`http://provider.internal:${port}/videos`, { method: "POST", body: form });
            expect(response.status).toBe(200);
            expect(contentType).toMatch(/^multipart\/form-data; boundary=/);
            expect(receivedBody).toContain('name="model"');
            expect(receivedBody).toContain("e2e-video-slow");
            expect(receivedBody).toContain('name="input_reference"; filename="reference.png"');
            expect(receivedBody).toContain("Content-Type: image/png");
        } finally {
            await close(server);
        }
    });

    it("keeps URL-encoded forms out of the multipart adapter", async () => {
        let contentType = "";
        let receivedBody = "";
        const server = createServer(async (request, response) => {
            contentType = request.headers["content-type"] || "";
            const chunks: Buffer[] = [];
            for await (const chunk of request) chunks.push(Buffer.from(chunk));
            receivedBody = Buffer.concat(chunks).toString("utf8");
            response.end("ok");
        });
        await listen(server);
        const port = (server.address() as AddressInfo).port;
        try {
            const response = await fetchSafeOutbound(`http://provider.internal:${port}/form`, {
                method: "POST",
                body: new URLSearchParams({ model: "text-model", prompt: "hello" }),
            });
            expect(response.status).toBe(200);
            expect(contentType).toBe("application/x-www-form-urlencoded;charset=UTF-8");
            expect(receivedBody).toBe("model=text-model&prompt=hello");
        } finally {
            await close(server);
        }
    });

    it("revalidates every redirect before opening the next connection", async () => {
        const server = createServer((_request, response) => {
            response.statusCode = 302;
            response.setHeader("location", "http://169.254.169.254/latest/meta-data");
            response.end();
        });
        await listen(server);
        const port = (server.address() as AddressInfo).port;
        try {
            await expect(fetchSafeOutbound(`http://provider.internal:${port}/redirect`)).rejects.toBeInstanceOf(UnsafeOutboundUrlError);
        } finally {
            await close(server);
        }
    });
});

function listen(server: ReturnType<typeof createServer>) {
    return new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => resolve());
    });
}

function close(server: ReturnType<typeof createServer>) {
    return new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
