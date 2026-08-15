import { apiUrl } from "@/flowcanvas/constant/env";
import { useUserStore } from "@/flowcanvas/stores/use-user-store";

export type DurableGenerationOptions = {
    signal?: AbortSignal;
    jobId?: string;
};

/**
 * 为指向本后端代理端点（/api/ai-proxy、/api/comfyui-proxy、/api/model-runtime/*）
 * 的请求附加会话与任务头。目标为第三方模型供应商（useProxy=false 直连）时
 * 不附加任何内容，避免 FlowCanvas 会话 token 泄漏给外部服务。
 */
export function durableGenerationHeaders(url: string, jobId?: string) {
    if (!isBackendGenerationUrl(url)) return {};
    const token = useUserStore.getState().token.trim();
    return {
        ...(token ? { "X-FlowCanvas-Session": token } : {}),
        ...(jobId ? { "X-FlowCanvas-Job-Id": jobId } : {}),
    };
}

function isBackendGenerationUrl(url: string) {
    try {
        const target = new URL(url, window.location.origin);
        const backend = new URL(apiUrl("/"), window.location.origin);
        return target.origin === backend.origin
            && (target.pathname.includes("/api/model-runtime/")
                || target.pathname === "/api/comfyui-proxy"
                || target.pathname === "/api/ai-proxy");
    } catch {
        return false;
    }
}
