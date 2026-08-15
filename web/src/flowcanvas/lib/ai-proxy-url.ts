import { apiUrl } from "@/flowcanvas/constant/env";

/**
 * 把上游 AI 返回的远程 URL 按需改写到 /api/ai-proxy。
 * 浏览器 fetch 改写后的 URL 是同源请求，不再受第三方 CDN CORS 限制。
 *
 * - `useProxy=false`：保持原 URL（默认前端直连语义）
 * - `useProxy=true` 且 URL 是 http(s)：改写为 /api/ai-proxy?target=...
 * - data: / blob: / asset:// / 其他协议：保持原样
 */
export function rewriteThroughProxy(url: string, useProxy?: boolean): string {
    if (!useProxy) return url;
    if (typeof url !== "string" || !url) return url;
    if (!/^https?:/i.test(url)) return url;
    return apiUrl(`/api/ai-proxy?target=${encodeURIComponent(url)}`);
}
