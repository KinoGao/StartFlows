import { apiUrl } from "@/flowcanvas/constant/env";
import type { LocalUser } from "@/flowcanvas/stores/use-user-store";

export type AuthResponse = {
    token: string;
    user: LocalUser;
};

export class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "ApiError";
        this.status = status;
    }
}

function authHeaders(token?: string): HeadersInit {
    return {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
}

async function readApi<T>(response: Response): Promise<T> {
    let body: { code?: number; data?: unknown; msg?: string } | null = null;
    try {
        body = (await response.json()) as { code?: number; data?: unknown; msg?: string };
    } catch {
        body = null;
    }
    if (!response.ok || body?.code !== 0) throw new ApiError(body?.msg || `请求失败：${response.status}`, response.status);
    return body.data as T;
}

export async function registerUser(input: { username: string; password: string; displayName?: string; authCode: string }): Promise<AuthResponse> {
    return readApi<AuthResponse>(
        await fetch(apiUrl("/api/auth/register"), {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(input),
        }),
    );
}

export async function loginUser(input: { username: string; password: string }): Promise<AuthResponse> {
    return readApi<AuthResponse>(
        await fetch(apiUrl("/api/auth/login"), {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(input),
        }),
    );
}

export async function adminLogin(input: { username: string; password: string; adminCode: string }): Promise<AuthResponse> {
    return readApi<AuthResponse>(
        await fetch(apiUrl("/api/auth/admin-login"), {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(input),
        }),
    );
}

export async function fetchCurrentUser(_token: string): Promise<LocalUser> {
    // VOZEB 适配：同源 Cookie 会话，/api/auth/session 为平铺 JSON
    const body = (await (await fetch(apiUrl("/api/auth/session"))).json()) as { user?: { id: string; username: string; displayName?: string; role?: "USER" | "ADMIN"; avatarUrl?: string } | null };
    const user = body?.user;
    if (!user) throw new ApiError("未登录", 401);
    return { id: user.id, username: user.username, displayName: user.displayName || user.username, role: user.role, avatarUrl: user.avatarUrl };
}

export async function logoutUser(token: string): Promise<void> {
    await readApi<void>(await fetch(apiUrl("/api/auth/logout"), { method: "POST", headers: authHeaders(token) }));
}

export function bearerHeaders(token: string): HeadersInit {
    return authHeaders(token);
}
