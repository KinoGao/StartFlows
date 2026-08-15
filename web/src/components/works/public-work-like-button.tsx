"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button } from "antd";
import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { getWorkCommunity, setWorkLike, type WorkCommunitySummary } from "@/services/api/work-community";
import { useUserStore } from "@/stores/use-user-store";

export function PublicWorkLikeButton({ slug, initialCount = 0, compact = false, nextPath }: { slug: string; initialCount?: number; compact?: boolean; nextPath?: string }) {
    const router = useRouter();
    const queryClient = useQueryClient();
    const user = useUserStore((state) => state.user);
    const { message } = App.useApp();
    const [loading, setLoading] = useState(false);
    const summaryQuery = useQuery({ queryKey: ["work-community", slug], queryFn: () => getWorkCommunity(slug), staleTime: 15_000 });
    const summary = summaryQuery.data;
    const count = summary?.likeCount ?? initialCount;

    const toggleLike = async () => {
        if (!user) {
            message.info("登录后可以点赞作品");
            router.push(`/login?next=${encodeURIComponent(nextPath || `/share/${slug}`)}`);
            return;
        }
        if (!summary || loading) return;
        setLoading(true);
        try {
            const result = await setWorkLike(slug, !summary.liked);
            queryClient.setQueryData<WorkCommunitySummary>(["work-community", slug], (current) => (current ? { ...current, liked: result.active, likeCount: result.likeCount } : current));
            message.success(result.active ? "已点赞" : "已取消点赞");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "点赞操作失败");
        } finally {
            setLoading(false);
        }
    };

    if (compact) {
        return (
            <button
                type="button"
                className={`inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] transition hover:bg-[#eef1f4] disabled:cursor-wait disabled:opacity-60 dark:hover:bg-[#252a31] ${summary?.liked ? "text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300" : "text-[#8b949f] hover:text-[#20242a] dark:text-[#7f8996] dark:hover:text-white"}`}
                disabled={!summary || loading}
                onClick={() => void toggleLike()}
                aria-label={summary?.liked ? "取消点赞" : "点赞作品"}
                aria-pressed={summary?.liked || false}
            >
                <Heart className={summary?.liked ? "size-3 fill-current" : "size-3"} />
                <span className="tabular-nums">{count}</span>
            </button>
        );
    }

    return (
        <Button icon={<Heart className={summary?.liked ? "size-4 fill-current" : "size-4"} />} loading={loading} disabled={!summary} onClick={() => void toggleLike()} aria-pressed={summary?.liked || false}>
            {count}
        </Button>
    );
}
