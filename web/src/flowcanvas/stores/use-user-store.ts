"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

// WebDAV 保存通道已移除，saveMode 仅保留后端账号一值（字段保留供
// 既有 `saveMode !== "backend"` 判断与 restoreKey 迁移兼容）。
export type SaveMode = "backend";
export type WorkspaceStatus = "idle" | "loading" | "ready" | "error";

export type LocalUser = {
    id: string;
    username: string;
    displayName: string;
    role?: "USER" | "ADMIN";
    avatarUrl?: string;
};

type UserStore = {
    hydrated: boolean;
    user: LocalUser | null;
    token: string;
    saveMode: SaveMode;
    workspaceStatus: WorkspaceStatus;
    workspaceError: string;
    backendImportedAtByUser: Record<string, string>;
    finishHydration: () => void;
    setSession: (user: LocalUser, token: string) => void;
    updateUser: (user: LocalUser) => void;
    clearSession: () => void;
    setWorkspaceState: (workspaceStatus: WorkspaceStatus, workspaceError?: string) => void;
    markBackendImported: (userId: string) => void;
};

export const useUserStore = create<UserStore>()(
    persist(
        (set) => ({
            hydrated: false,
            user: null,
            token: "",
            saveMode: "backend",
            workspaceStatus: "idle",
            workspaceError: "",
            backendImportedAtByUser: {},
            finishHydration: () => set({ hydrated: true }),
            setSession: (user, token) => set({ user, token, saveMode: "backend", workspaceStatus: "loading", workspaceError: "" }),
            updateUser: (user) => set({ user }),
            clearSession: () => set({ user: null, token: "", saveMode: "backend", workspaceStatus: "idle", workspaceError: "" }),
            setWorkspaceState: (workspaceStatus, workspaceError = "") => set({ workspaceStatus, workspaceError }),
            markBackendImported: (userId) =>
                set((state) => ({
                    backendImportedAtByUser: {
                        ...state.backendImportedAtByUser,
                        [userId]: new Date().toISOString(),
                    },
                })),
        }),
        {
            name: "infinite-canvas:user_store",
            partialize: (state) => ({
                user: state.user,
                token: state.token,
                saveMode: state.saveMode,
                backendImportedAtByUser: state.backendImportedAtByUser,
            }),
            merge: (persisted, current) => {
                const saved = (persisted || {}) as Partial<UserStore>;
                return {
                    ...current,
                    ...saved,
                    // 旧的 WebDAV 保存模式持久值一律迁移回后端账号。
                    saveMode: "backend",
                    workspaceStatus: "idle",
                    workspaceError: "",
                };
            },
            onRehydrateStorage: (state) => () => state.finishHydration(),
        },
    ),
);
