"use client";

import { create } from "zustand";
import type { AdminPermission } from "@/lib/admin-permissions";

export type LocalUser = {
    id: string;
    accountId: string;
    username: string;
    email?: string;
    displayName: string;
    bio: string;
    avatarUrl?: string;
    role: "admin" | "user";
    adminPermissions: AdminPermission[];
    status: "active" | "disabled";
    planId: string;
    planName: string;
    hasActivePlan: boolean;
    pointsBalance: number;
    permanentPointsBalance?: number;
    dailyPointsBalance?: number;
    dailyPointsExpiresAt?: string;
    mfaEnabled: boolean;
};

type UserStore = {
    user: LocalUser | null;
    setUser: (user: LocalUser | null) => void;
    clearSession: () => void;
};

export const useUserStore = create<UserStore>()((set) => ({
    user: null,
    setUser: (user) => set({ user }),
    clearSession: () => set({ user: null }),
}));
