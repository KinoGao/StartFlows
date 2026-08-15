import type { UserLoginEvent } from "@/lib/login-security";

export async function listUserLoginEvents(input: { page: number; pageSize: number }) {
    const query = new URLSearchParams({ page: String(input.page), pageSize: String(input.pageSize) });
    const response = await fetch(`/api/auth/login-events?${query}`, { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as { items?: UserLoginEvent[]; total?: number; page?: number; pageSize?: number; error?: string } | null;
    if (!response.ok || !payload?.items) throw new Error(payload?.error || "登录记录加载失败");
    return { items: payload.items, total: Number(payload.total || 0), page: Number(payload.page || input.page), pageSize: Number(payload.pageSize || input.pageSize) };
}
