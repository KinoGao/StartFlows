"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, Select } from "antd";
import { UserRound } from "lucide-react";

import type { PublicUser } from "@/lib/auth/store";
import { formatAccountId, parseAccountId } from "@/lib/account-id";

function normalizedAccountId(value?: string) {
    return parseAccountId(value) ? formatAccountId(value) : undefined;
}

export function AdminAccountId({ accountId, className = "" }: { accountId?: string; className?: string }) {
    const displayAccountId = normalizedAccountId(accountId);
    if (!displayAccountId) return null;
    return (
        <span className={`inline-flex min-w-0 items-baseline whitespace-nowrap text-xs leading-5 ${className}`} title={`ID：${displayAccountId}`} aria-label={`账号 ID ${displayAccountId}`}>
            <span className="shrink-0 text-zinc-400 dark:text-zinc-500">ID：</span>
            <span className="font-mono font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">{displayAccountId}</span>
        </span>
    );
}

export function AdminUserIdentity({ displayName, username, accountId, avatarUrl, fallback = "未知用户", className = "" }: { displayName?: string; username?: string; accountId?: string; avatarUrl?: string; fallback?: string; className?: string }) {
    const primary = displayName || username || fallback;
    return (
        <div className={`flex min-w-0 items-center gap-2.5 ${className}`}>
            <Avatar size={32} src={avatarUrl} icon={<UserRound className="size-4" />} className="shrink-0 !bg-zinc-100 !text-zinc-500 dark:!bg-zinc-800 dark:!text-zinc-300" />
            <div className="min-w-0">
                <div className="truncate text-sm font-medium text-zinc-950 dark:text-zinc-100">{primary}</div>
                <div className="mt-0.5 flex min-w-0 items-center gap-2">
                    {username ? <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">@{username}</span> : null}
                    <AdminAccountId accountId={accountId} className="shrink-0" />
                </div>
            </div>
        </div>
    );
}

export function AdminUserSearchSelect({
    value,
    onChange,
    activeOnly = false,
    placeholder = "搜索昵称、用户名、邮箱或用户 ID",
    className = "w-full",
}: {
    value?: string;
    onChange?: (value?: string) => void;
    activeOnly?: boolean;
    placeholder?: string;
    className?: string;
}) {
    const requestIdRef = useRef(0);
    const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [users, setUsers] = useState<PublicUser[]>([]);
    const [selectedUser, setSelectedUser] = useState<PublicUser>();
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState(false);

    useEffect(
        () => () => {
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
            requestIdRef.current += 1;
        },
        [],
    );

    const load = useCallback(
        async (keyword = "") => {
            const requestId = ++requestIdRef.current;
            setLoading(true);
            setFailed(false);
            try {
                const params = new URLSearchParams({ page: "1", pageSize: "20" });
                if (keyword.trim()) params.set("keyword", keyword.trim());
                if (activeOnly) params.set("status", "active");
                const response = await fetch(`/api/admin/users?${params.toString()}`, { cache: "no-store" });
                const payload = (await response.json().catch(() => null)) as { users?: PublicUser[] } | null;
                if (!response.ok || !payload?.users) throw new Error("用户加载失败");
                if (requestId === requestIdRef.current) setUsers(payload.users);
            } catch {
                if (requestId === requestIdRef.current) {
                    setUsers([]);
                    setFailed(true);
                }
            } finally {
                if (requestId === requestIdRef.current) setLoading(false);
            }
        },
        [activeOnly],
    );

    const optionUsers = [...(selectedUser ? [selectedUser] : []), ...users.filter((user) => user.id !== selectedUser?.id)];
    const options = optionUsers.map((user) => {
        const accountId = normalizedAccountId(user.accountId);
        return {
            value: user.id,
            label: `${user.displayName || user.username}${accountId ? ` · ID：${accountId}` : ""}`,
            disabled: activeOnly && user.status !== "active",
        };
    });

    return (
        <Select
            allowClear
            showSearch
            filterOption={false}
            className={className}
            value={value}
            loading={loading}
            status={failed ? "error" : undefined}
            placeholder={placeholder}
            aria-label={placeholder}
            notFoundContent={failed ? "用户加载失败" : loading ? "正在搜索..." : "未找到用户"}
            options={options}
            optionRender={(option) => {
                const user = optionUsers.find((item) => item.id === option.value);
                if (!user) return option.label;
                return (
                    <div className="min-w-0 py-0.5">
                        <div className="flex min-w-0 items-center justify-between gap-3">
                            <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{user.displayName || user.username}</span>
                            <AdminAccountId accountId={user.accountId} className="shrink-0" />
                        </div>
                        <div className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                            @{user.username}
                            {user.email ? ` · ${user.email}` : ""}
                            {user.status !== "active" ? " · 已禁用" : ""}
                        </div>
                    </div>
                );
            }}
            onOpenChange={(open) => {
                if (open && !users.length) void load();
            }}
            onSearch={(keyword) => {
                if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                searchTimerRef.current = setTimeout(() => void load(keyword), 250);
            }}
            onChange={(nextValue) => {
                setSelectedUser(users.find((user) => user.id === nextValue));
                onChange?.(nextValue);
            }}
        />
    );
}
