import type { LocalUser } from "@/stores/use-user-store";

type ApiResponse<T> = { code: number; data: T; msg: string };

export type AdminMfaSetup = {
    secret: string;
    uri: string;
};

export function beginAdminMfaSetup(currentPassword: string) {
    return requestMfa<AdminMfaSetup>("POST", { currentPassword });
}

export async function enableAdminMfa(token: string) {
    return (await requestMfa<{ user: LocalUser }>("PATCH", { token })).user;
}

export async function disableAdminMfa(currentPassword: string, token: string) {
    return (await requestMfa<{ user: LocalUser }>("DELETE", { currentPassword, token })).user;
}

async function requestMfa<T>(method: "POST" | "PATCH" | "DELETE", body: Record<string, string>) {
    const response = await fetch("/api/auth/mfa", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => null)) as ApiResponse<T> | null;
    if (!response.ok || !payload || payload.code !== 0) throw new Error(payload?.msg || "MFA 操作失败");
    return payload.data;
}
