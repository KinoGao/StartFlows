"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";

import { type LocalUser, useUserStore } from "@/stores/use-user-store";

type AuthUserHydratorProps = {
    user: LocalUser;
    children: ReactNode;
};

export function AuthUserHydrator({ user, children }: AuthUserHydratorProps) {
    const setUser = useUserStore((state) => state.setUser);

    useEffect(() => {
        setUser(user);
    }, [setUser, user]);

    return <>{children}</>;
}
