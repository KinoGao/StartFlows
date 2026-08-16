import net from "node:net";
import tls from "node:tls";

/**
 * 手动 CONNECT 代理 fetch（裸 socket 直读）。
 * undici ProxyAgent / Node http 客户端在 Clash 隧道下都会被分层读取拖垮（几 MB 后掉到 10KB/s 级），
 * 裸 socket flowing 读取可跑满（实测 5MB/s）。这里用最小 HTTP/1.1 响应解析换取满速吞吐。
 */
export async function connectProxyFetch(target: URL, init: { method?: string; headers?: Headers; body?: import("undici").BodyInit | null; signal?: AbortSignal | null }, proxyUrl: string): Promise<Response> {
    const proxy = new URL(proxyUrl);
    const proxyHost = proxy.hostname;
    const proxyPort = Number(proxy.port || 80);
    const method = (init.method || "GET").toUpperCase();
    const isTls = target.protocol === "https:";

    const tunnel = await openTunnel(proxyHost, proxyPort, target.hostname, Number(target.port || (isTls ? 443 : 80)), proxy.username ? `Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64")}` : "", init.signal);
    try {
        return await sendRequest(tunnel, target, method, init.headers || new Headers(), init.body ?? null, isTls, init.signal);
    } catch (error) {
        tunnel.destroy();
        throw error;
    }
}

function openTunnel(proxyHost: string, proxyPort: number, targetHost: string, targetPort: number, proxyAuthorization: string, signal?: AbortSignal | null): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
        const socket = net.connect(proxyPort, proxyHost);
        const onAbort = () => {
            socket.destroy();
            reject(new DOMException("The operation was aborted", "AbortError"));
        };
        if (signal) {
            if (signal.aborted) return onAbort();
            signal.addEventListener("abort", onAbort, { once: true });
        }
        const cleanup = () => signal?.removeEventListener("abort", onAbort);
        socket.once("error", (error) => {
            cleanup();
            reject(error);
        });
        socket.once("connect", () => {
            const auth = proxyAuthorization ? `Proxy-Authorization: ${proxyAuthorization}\r\n` : "";
            socket.write(`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n${auth}\r\n`);
        });
        const chunks: Buffer[] = [];
        let length = 0;
        const onData = (chunk: Buffer) => {
            chunks.push(chunk);
            length += chunk.length;
            const all = Buffer.concat(chunks, length);
            const headerEnd = all.indexOf("\r\n\r\n");
            if (headerEnd < 0) return;
            socket.removeListener("data", onData);
            cleanup();
            const statusLine = all.slice(0, headerEnd).toString("latin1").split("\r\n", 1)[0];
            const statusCode = Number(statusLine.split(" ")[1] || 0);
            if (statusCode !== 200) {
                socket.destroy();
                reject(new Error(`代理 CONNECT 失败：${statusLine}`));
                return;
            }
            const rest = all.slice(headerEnd + 4);
            if (rest.length) socket.unshift(rest);
            resolve(socket);
        };
        socket.on("data", onData);
    });
}

/**
 * 裸 socket 直读 HTTP/1.1 响应。
 * 经 Clash 隧道时，Node HTTP 客户端（llhttp 分层读取）会在几 MB 后把吞吐压到 10KB/s 级，
 * 裸 socket flowing 读取可跑满。这里手写最小响应解析：状态行 + 头 + Content-Length / chunked / 读至关闭。
 */
function sendRequest(tunnel: net.Socket, target: URL, method: string, headers: Headers, body: unknown, isTls: boolean, signal?: AbortSignal | null): Promise<Response> {
    return new Promise((resolve, reject) => {
        const socket: net.Socket | tls.TLSSocket = isTls ? tls.connect({ socket: tunnel, servername: target.hostname }) : tunnel;
        const destroy = (error?: Error) => socket.destroy(error);
        const onAbort = () => destroy(new DOMException("The operation was aborted", "AbortError"));
        if (signal) {
            if (signal.aborted) return onAbort();
            signal.addEventListener("abort", onAbort, { once: true });
        }

        const headerLines: string[] = [`${method} ${target.pathname}${target.search} HTTP/1.1`, `Host: ${target.host}`, "Connection: close"];
        headers.forEach((value, key) => {
            if (["host", "connection", "content-length", "proxy-authorization"].includes(key.toLowerCase())) return;
            headerLines.push(`${key}: ${value}`);
        });

        const writeRequest = (payload: Buffer | null) => {
            const lines = [...headerLines];
            if (payload) lines.push(`Content-Length: ${payload.length}`);
            socket.write(`${lines.join("\r\n")}\r\n\r\n`);
            if (payload) socket.write(payload);
        };

        // 响应解析状态机
        let buffer: Buffer[] = [];
        let buffered = 0;
        let phase: "head" | "body-length" | "body-chunked" | "body-till-end" | "done" = "head";
        let remaining = 0;
        let response: Response | null = null;
        let bodyController: ReadableStreamDefaultController<Uint8Array> | null = null;
        let settled = false;

        const take = (n: number): Buffer | null => {
            if (buffered < n) return null;
            const all = Buffer.concat(buffer, buffered);
            const part = all.subarray(0, n);
            const rest = all.subarray(n);
            buffer = rest.length ? [rest] : [];
            buffered = rest.length;
            return part;
        };
        const finishBody = () => {
            if (phase === "done") return;
            phase = "done";
            try {
                bodyController?.close();
            } catch { /* 已关闭 */ }
            socket.destroy();
        };
        const failBody = (error: Error) => {
            if (phase === "done") return;
            phase = "done";
            try {
                bodyController?.error(error);
            } catch { /* 已关闭 */ }
            socket.destroy();
        };

        const onData = (chunk: Buffer) => {
            buffer.push(chunk);
            buffered += chunk.length;
            while (true) {
                if (phase === "head") {
                    const all = Buffer.concat(buffer, buffered);
                    const headerEnd = all.indexOf("\r\n\r\n");
                    if (headerEnd < 0) return;
                    const head = all.slice(0, headerEnd).toString("latin1");
                    const rest = all.slice(headerEnd + 4);
                    buffer = rest.length ? [rest] : [];
                    buffered = rest.length;
                    const lines = head.split("\r\n");
                    const statusParts = (lines[0] || "").split(" ");
                    const status = Number(statusParts[1] || 0);
                    const statusText = statusParts.slice(2).join(" ");
                    const responseHeaders = new Headers();
                    lines.slice(1).forEach((line) => {
                        const sep = line.indexOf(":");
                        if (sep <= 0) return;
                        const key = line.slice(0, sep).trim();
                        const value = line.slice(sep + 1).trim();
                        if (key) responseHeaders.append(key, value);
                    });
                    const noBody = method === "HEAD" || status === 204 || status === 304;
                    const contentLength = Number(responseHeaders.get("content-length") || -1);
                    const chunked = (responseHeaders.get("transfer-encoding") || "").toLowerCase().includes("chunked");
                    phase = noBody ? "done" : chunked ? "body-chunked" : contentLength >= 0 ? "body-length" : "body-till-end";
                    remaining = contentLength > 0 ? contentLength : 0;
                    response = new Response(
                        noBody
                            ? null
                            : new ReadableStream<Uint8Array>({
                                  start(controller) {
                                      bodyController = controller;
                                  },
                                  cancel() {
                                      socket.destroy();
                                  },
                              }),
                        { status, statusText, headers: responseHeaders },
                    );
                    settled = true;
                    signal?.removeEventListener("abort", onAbort);
                    resolve(response);
                    if (noBody) {
                        socket.destroy();
                        return;
                    }
                    if (phase === "body-length" && remaining === 0) {
                        finishBody();
                        return;
                    }
                    continue;
                }
                if (phase === "body-length") {
                    if (remaining > 0) {
                        const available = Math.min(remaining, buffered);
                        if (!available) return;
                        const part = take(available)!;
                        remaining -= part.length;
                        bodyController?.enqueue(new Uint8Array(part));
                    }
                    if (remaining === 0) finishBody();
                    return;
                }
                if (phase === "body-chunked") {
                    // chunked 帧：hex 行 + 数据 + \r\n；0 帧后跟 trailer 到 \r\n\r\n
                    const all = Buffer.concat(buffer, buffered);
                    const lineEnd = all.indexOf("\r\n");
                    if (lineEnd < 0) return;
                    const sizeText = all.slice(0, lineEnd).toString("latin1").trim();
                    const size = Number.parseInt(sizeText, 16);
                    if (!Number.isFinite(size)) return failBody(new Error("代理响应 chunked 帧无效"));
                    if (size === 0) {
                        if (all.length < lineEnd + 4) return;
                        finishBody();
                        return;
                    }
                    if (all.length < lineEnd + 2 + size + 2) return;
                    const part = all.slice(lineEnd + 2, lineEnd + 2 + size);
                    const rest = all.slice(lineEnd + 2 + size + 2);
                    buffer = rest.length ? [rest] : [];
                    buffered = rest.length;
                    bodyController?.enqueue(new Uint8Array(part));
                    continue;
                }
                if (phase === "body-till-end") {
                    const part = take(buffered);
                    if (part?.length) bodyController?.enqueue(new Uint8Array(part));
                    return;
                }
                return;
            }
        };

        socket.on("data", onData);
        socket.on("end", () => {
            if (phase === "body-till-end" || phase === "body-length" || phase === "body-chunked") finishBody();
        });
        socket.on("error", (error) => {
            if (!settled) {
                signal?.removeEventListener("abort", onAbort);
                reject(error);
            } else failBody(error);
        });

        if (body !== null && body !== undefined) {
            void (async () => {
                try {
                    writeRequest(await bodyToBuffer(body));
                } catch (error) {
                    destroy(error instanceof Error ? error : new Error(String(error)));
                }
            })();
        } else {
            // TLSSocket 在握手完成前会缓冲写入，直接写即可
            writeRequest(null);
        }
    });
}

async function bodyToBuffer(body: unknown): Promise<Buffer> {
    if (Buffer.isBuffer(body)) return body;
    if (typeof body === "string") return Buffer.from(body);
    if (body instanceof Uint8Array) return Buffer.from(body);
    if (body instanceof ArrayBuffer) return Buffer.from(body);
    if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
    if (body instanceof ReadableStream) {
        const reader = body.getReader();
        const chunks: Buffer[] = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(Buffer.from(value));
        }
        return Buffer.concat(chunks);
    }
    return Buffer.from(String(body));
}
