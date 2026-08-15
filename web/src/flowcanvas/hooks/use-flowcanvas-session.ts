"use client";

import { useEffect } from "react";

import { apiUrl } from "@/flowcanvas/constant/env";
import { useUserStore } from "@/flowcanvas/stores/use-user-store";

type VozebSessionUser = { id: string; username: string; displayName?: string; role?: "USER" | "ADMIN"; avatarUrl?: string };

/** 把 VOZEB 的 Cookie 会话注入 FlowCanvas 的 user store（token 为占位值，请求走同源 Cookie）。 */
export function useFlowcanvasSession() {
    const hydrated = useUserStore((state) => state.hydrated);
    const user = useUserStore((state) => state.user);
    const setSession = useUserStore((state) => state.setSession);
    const clearSession = useUserStore((state) => state.clearSession);

    useEffect(() => {
        if (!hydrated || user) return;
        let cancelled = false;
        void fetch(apiUrl("/api/auth/session"))
            .then((response) => response.json())
            .then((body: { user?: VozebSessionUser | null }) => {
                if (cancelled) return;
                const sessionUser = body?.user;
                if (sessionUser) {
                    setSession(
                        {
                            id: sessionUser.id,
                            username: sessionUser.username,
                            displayName: sessionUser.displayName || sessionUser.username,
                            role: sessionUser.role,
                            avatarUrl: sessionUser.avatarUrl,
                        },
                        "vozeb-cookie-session",
                    );
                }
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [hydrated, user, setSession, clearSession]);
}
