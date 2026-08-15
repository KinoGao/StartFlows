"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchAnnouncements } from "@/services/api/announcements";

export const ANNOUNCEMENTS_QUERY_KEY = ["public-announcements"] as const;

export function useAnnouncements(options: { enabled?: boolean } = {}) {
    return useQuery({
        queryKey: ANNOUNCEMENTS_QUERY_KEY,
        queryFn: ({ signal }) => fetchAnnouncements(signal),
        staleTime: 60_000,
        enabled: options.enabled ?? true,
    });
}
