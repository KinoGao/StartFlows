import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getComfyUiConfig } from "@/lib/server/comfyui-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * FlowCanvas ComfyUI 代理（移植自旧 Spring ComfyUiProxyController）：
 * 白名单路径转发到服务端配置的 ComfyUI 地址；/view 媒体读取支持未登录 <img> 加载，
 * 此时强制使用后台配置地址，不接受客户端 baseUrl（防 SSRF）。
 */
const ALLOWED_PATHS = ["/system_stats", "/object_info", "/prompt", "/history/", "/view", "/upload/image"];
const DEFAULT_BASE_URL = "http://127.0.0.1:8188";
const PROXY_TIMEOUT_MS = 10 * 60 * 1000;
const MEDIA_REQUEST_HEADERS = ["range", "if-range", "if-none-match", "if-modified-since"];
const MEDIA_RESPONSE_HEADERS = ["content-type", "content-length", "content-disposition", "content-range", "content-encoding", "accept-ranges", "etag", "last-modified", "cache-control"];

function requestPath(path: string) {
    const queryIndex = path.indexOf("?");
    return queryIndex < 0 ? path : path.slice(0, queryIndex);
}

async function buildTargetUrl(clientBaseUrl: string, path: string) {
    // 与旧后端一致：后台配置的地址优先，客户端 baseUrl 仅作兜底
    const configured = await getComfyUiConfig();
    const normalizedBase = (configured.baseUrl || clientBaseUrl.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
    let base: URL;
    try {
        base = new URL(normalizedBase);
    } catch {
        throw new Error("ComfyUI 地址无效");
    }
    if (base.protocol !== "http:" && base.protocol !== "https:") throw new Error("ComfyUI 地址只支持 http/https");
    if (base.username || base.password) throw new Error("ComfyUI 地址不允许包含凭据");
    if (!path.startsWith("/") || path.includes("://")) throw new Error("ComfyUI 路径无效");
    const pathname = requestPath(path);
    const allowed = ALLOWED_PATHS.some((item) => pathname === item || (item.endsWith("/") && pathname.startsWith(item)));
    if (!allowed) throw new Error("ComfyUI 路径不在允许范围");
    return `${normalizedBase}${path}`;
}

function jsonError(status: number, detail: string) {
    return NextResponse.json({ detail }, { status });
}

function passthroughResponse(upstream: Response, body: ArrayBuffer | null) {
    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    return new Response(body, { status: upstream.status, headers });
}

async function proxyBuffered(target: string, init: RequestInit) {
    try {
        const upstream = await fetch(target, { ...init, redirect: "manual", signal: AbortSignal.timeout(PROXY_TIMEOUT_MS) });
        const body = await upstream.arrayBuffer();
        return passthroughResponse(upstream, body);
    } catch (error) {
        return jsonError(502, error instanceof Error ? error.message : "ComfyUI 请求失败");
    }
}

async function proxyMedia(target: string, request: Request) {
    const headers = new Headers();
    MEDIA_REQUEST_HEADERS.forEach((name) => {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
    });
    try {
        const upstream = await fetch(target, { method: "GET", headers, redirect: "manual", signal: AbortSignal.timeout(PROXY_TIMEOUT_MS) });
        const responseHeaders = new Headers();
        MEDIA_RESPONSE_HEADERS.forEach((name) => {
            const value = upstream.headers.get(name);
            if (value) responseHeaders.set(name, value);
        });
        return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
    } catch (error) {
        return jsonError(502, error instanceof Error ? error.message : "ComfyUI 媒体请求失败");
    }
}

export async function GET(request: Request) {
    const url = new URL(request.url);
    const baseUrl = url.searchParams.get("baseUrl") || "";
    const path = url.searchParams.get("path") || "";
    const isView = requestPath(path) === "/view";

    // 未登录只允许 /view 媒体读取（画布 <img> 加载 ComfyUI 输出），且强制后台配置地址
    const currentUser = await getCurrentUser();
    const publicMediaRead = isView && !currentUser;
    if (!currentUser && !publicMediaRead) return jsonError(401, "请先登录");

    let target: string;
    try {
        target = await buildTargetUrl(publicMediaRead ? "" : baseUrl, path);
    } catch (error) {
        return jsonError(400, error instanceof Error ? error.message : "ComfyUI 地址无效");
    }
    if (isView) return proxyMedia(target, request);
    return proxyBuffered(target, { method: "GET" });
}

export async function POST(request: Request) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return jsonError(401, "请先登录");

    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
        let form: FormData;
        try {
            form = await request.formData();
        } catch {
            return jsonError(400, "上传内容无效");
        }
        const image = form.get("image");
        if (!(image instanceof File)) return jsonError(400, "缺少上传文件");
        const baseUrl = typeof form.get("baseUrl") === "string" ? String(form.get("baseUrl")) : "";
        let target: string;
        try {
            target = await buildTargetUrl(baseUrl, "/upload/image");
        } catch (error) {
            return jsonError(400, error instanceof Error ? error.message : "ComfyUI 地址无效");
        }
        const forward = new FormData();
        forward.append("image", image, image.name || "image");
        return proxyBuffered(target, { method: "POST", body: forward });
    }

    let payload: { baseUrl?: unknown; path?: unknown; method?: unknown; body?: unknown };
    try {
        payload = (await request.json()) as typeof payload;
    } catch {
        return jsonError(400, "请求内容不是有效 JSON");
    }
    const baseUrl = typeof payload.baseUrl === "string" ? payload.baseUrl : "";
    const path = typeof payload.path === "string" ? payload.path : "";
    const method = payload.method === "GET" ? "GET" : "POST";
    let target: string;
    try {
        target = await buildTargetUrl(baseUrl, path);
    } catch (error) {
        return jsonError(400, error instanceof Error ? error.message : "ComfyUI 地址无效");
    }
    return proxyBuffered(target, {
        method,
        headers: payload.body === undefined ? undefined : { "Content-Type": "application/json" },
        body: payload.body === undefined ? undefined : JSON.stringify(payload.body),
    });
}
