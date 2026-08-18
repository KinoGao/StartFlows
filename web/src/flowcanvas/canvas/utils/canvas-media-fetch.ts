/**
 * 解析参考媒体的可抓取地址：站内绝对地址统一改写成当前 origin 的同源路径。
 * 历史项目可能存着 localhost 等旧 origin（上传时按当时访问地址固化），
 * 换域名/隧道访问后浏览器直接 fetch 旧地址会 Failed to fetch。
 */
export function toFetchableMediaUrl(source: string, storageKey: string | undefined, origin: string) {
    if (source) {
        try {
            const parsed = new URL(source, origin);
            if (parsed.origin === origin || parsed.pathname.startsWith("/api/")) return `${parsed.pathname}${parsed.search}`;
        } catch {
            // 非法地址原样返回，由 fetch 报错
        }
        return source;
    }
    if (storageKey?.startsWith("backend:")) return `/api/reference-assets/${storageKey.slice("backend:".length)}`;
    return "";
}
