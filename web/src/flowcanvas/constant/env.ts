export const DOCS_URL = process.env.NEXT_PUBLIC_DOC_URL || "https://docs.canvas.best";

/** Next.js 同源部署：API 路径直接返回（Cookie 会话鉴权，无需跨域 base）。 */
export function apiUrl(path: string) {
    return path.startsWith("/") ? path : `/${path}`;
}
