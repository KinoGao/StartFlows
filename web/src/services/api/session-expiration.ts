"use client";

import { resetPublicSession } from "@/stores/use-public-session-store";
import { useUserStore } from "@/stores/use-user-store";

let redirecting = false;

export class ClientSessionExpiredError extends Error {
    constructor() {
        super("登录状态已失效，请重新登录");
        this.name = "ClientSessionExpiredError";
    }
}

export function throwIfClientSessionExpired(response: Response) {
    if (response.status !== 401) return;
    expireClientSession();
    throw new ClientSessionExpiredError();
}

export function expireClientSession() {
    useUserStore.getState().clearSession();
    resetPublicSession();
    if (typeof window === "undefined" || redirecting || window.location.pathname === "/login") return;
    redirecting = true;
    window.location.assign("/login");
}

export async function stopIfClientSessionExpired() {
    try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        if (!response.ok) return false;
        const payload = (await response.json().catch(() => null)) as { user?: unknown } | null;
        if (payload && payload.user) return false;
        expireClientSession();
        return true;
    } catch {
        return false;
    }
}
