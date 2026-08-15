"use client";

import { useCallback, useEffect, useState } from "react";
import { App, Button, Pagination, Skeleton, Tag } from "antd";
import { History, MonitorSmartphone, RefreshCw, Wifi } from "lucide-react";

import type { UserLoginEvent } from "@/lib/login-security";
import { listUserLoginEvents } from "@/services/api/login-security";

import { RECORD_PAGE_SIZE, profileSecondaryButtonClass } from "./profile-elements";

export function LoginSecurityPanel() {
    const { message } = App.useApp();
    const [items, setItems] = useState<UserLoginEvent[]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);

    const load = useCallback(
        async (targetPage: number) => {
            setLoading(true);
            try {
                const result = await listUserLoginEvents({ page: targetPage, pageSize: RECORD_PAGE_SIZE });
                setItems(result.items);
                setTotal(result.total);
                setPage(result.page);
            } catch (error) {
                message.error(error instanceof Error ? error.message : "登录记录加载失败");
            } finally {
                setLoading(false);
            }
        },
        [message],
    );

    useEffect(() => {
        void load(1);
    }, [load]);

    return (
        <div className="max-w-xl space-y-4 border-t border-stone-200 pt-5 dark:border-stone-800">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <History className="size-4 text-stone-500 dark:text-stone-400" />
                        <h3 className="text-sm font-semibold text-stone-950 dark:text-white">登录记录</h3>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-stone-500 dark:text-stone-400">查看账号最近的成功登录环境。</p>
                </div>
                <Button className={profileSecondaryButtonClass} size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void load(page)}>
                    刷新
                </Button>
            </div>

            {loading && !items.length ? (
                <Skeleton active paragraph={{ rows: 3 }} />
            ) : items.length ? (
                <div className="divide-y divide-stone-200 overflow-hidden rounded-md border border-stone-200 dark:divide-stone-800 dark:border-stone-800">
                    {items.map((item, index) => (
                        <div key={item.id} className="min-w-0 bg-white px-3 py-3 dark:bg-stone-950">
                            <div className="flex min-w-0 items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-stone-900 dark:text-stone-100">
                                    <Wifi className="size-4 shrink-0 text-stone-400" />
                                    <span className="truncate">{item.ip || "网络地址不可用"}</span>
                                </div>
                                {page === 1 && index === 0 ? <Tag color="green">最近登录</Tag> : <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">{formatLoginTime(item.createdAt)}</span>}
                            </div>
                            <div className="mt-2 flex min-w-0 items-start gap-2 text-xs leading-5 text-stone-500 dark:text-stone-400">
                                <MonitorSmartphone className="mt-0.5 size-3.5 shrink-0" />
                                <span className="min-w-0 break-words" title={item.userAgent}>
                                    {item.userAgent || "浏览器标识不可用"}
                                </span>
                            </div>
                            {page === 1 && index === 0 ? <div className="mt-1 text-right text-xs text-stone-500 dark:text-stone-400">{formatLoginTime(item.createdAt)}</div> : null}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="rounded-md border border-dashed border-stone-200 px-3 py-6 text-center text-sm text-stone-500 dark:border-stone-800 dark:text-stone-400">暂无登录记录</div>
            )}

            {total > RECORD_PAGE_SIZE ? <Pagination size="small" current={page} pageSize={RECORD_PAGE_SIZE} total={total} showSizeChanger={false} onChange={(nextPage) => void load(nextPage)} /> : null}
        </div>
    );
}

function formatLoginTime(value: string) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : "-";
}
