"use client";

import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import { listInteractionNotifications, markAllInteractionNotificationsRead, markInteractionNotificationRead } from "@/services/api/work-community";

export function useInteractionNotifications(userId?: string) {
    const queryClient = useQueryClient();
    const queryKey = ["interaction-notifications", userId] as const;
    const query = useInfiniteQuery({
        queryKey,
        queryFn: ({ pageParam, signal }) => listInteractionNotifications({ limit: 20, cursor: pageParam }, signal),
        initialPageParam: undefined as string | undefined,
        getNextPageParam: (lastPage) => lastPage.nextCursor,
        enabled: Boolean(userId),
        staleTime: 20_000,
    });
    const items = useMemo(() => query.data?.pages.flatMap((page) => page.items) || [], [query.data]);
    const unreadCount = query.data?.pages[0]?.unreadCount || 0;

    const markRead = async (id: string) => {
        await markInteractionNotificationRead(id);
        await queryClient.invalidateQueries({ queryKey });
    };

    const markAllRead = async () => {
        await markAllInteractionNotificationsRead();
        await queryClient.invalidateQueries({ queryKey });
    };

    return { ...query, items, unreadCount, markRead, markAllRead };
}
