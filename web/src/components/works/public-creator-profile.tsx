"use client";

import { App, Button } from "antd";
import { Heart, ImageIcon, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PublicWorkGalleryCard } from "@/components/works/public-work-gallery-card";
import { ResponsiveMasonryGrid } from "@/components/works/responsive-masonry-grid";
import { userAvatarFallback } from "@/lib/user-avatar";
import { getPublicCreatorPage, setPublicCreatorFollow, type PublicCreatorPage } from "@/services/api/work-community";
import { useUserStore } from "@/stores/use-user-store";

export function PublicCreatorProfile({
    initialData,
    nextPath,
    onOpenWork,
    onOpenAuthor,
    compact = false,
}: {
    initialData: PublicCreatorPage;
    nextPath: string;
    onOpenWork: (slug: string) => void;
    onOpenAuthor?: (username: string) => void;
    compact?: boolean;
}) {
    const { message } = App.useApp();
    const router = useRouter();
    const user = useUserStore((state) => state.user);
    const [profile, setProfile] = useState(initialData.profile);
    const [items, setItems] = useState(initialData.items);
    const [cursor, setCursor] = useState(initialData.nextCursor);
    const [followingBusy, setFollowingBusy] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);

    const toggleFollow = async () => {
        if (!user) {
            message.info("登录后可关注创作者");
            router.push(`/login?next=${encodeURIComponent(nextPath)}`);
            return;
        }
        if (followingBusy) return;
        setFollowingBusy(true);
        try {
            const result = await setPublicCreatorFollow(profile.username, !profile.following);
            setProfile((current) => ({ ...current, following: result.active, followerCount: result.followerCount }));
            message.success(result.active ? "已关注作者" : "已取消关注");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "关注操作失败");
        } finally {
            setFollowingBusy(false);
        }
    };

    const loadMore = async () => {
        if (!cursor || loadingMore) return;
        setLoadingMore(true);
        try {
            const page = await getPublicCreatorPage(profile.username, { limit: 18, cursor });
            setItems((current) => {
                const known = new Set(current.map((item) => item.slug));
                return [...current, ...page.items.filter((item) => !known.has(item.slug))];
            });
            setCursor(page.nextCursor);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "更多作品加载失败");
        } finally {
            setLoadingMore(false);
        }
    };

    return (
        <div className={compact ? "min-w-0 px-3 pb-5 sm:px-6" : "mx-auto w-full max-w-[1440px] px-3 pb-12 sm:px-6 sm:pb-16 lg:px-8"}>
            <section className={`flex min-w-0 flex-col items-center text-center ${compact ? "pb-5 pt-5 sm:pb-6 sm:pt-6" : "pb-5 pt-6 sm:pb-7 sm:pt-8"}`} aria-labelledby="creator-name">
                <span className="grid size-18 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground text-lg font-semibold text-background ring-1 ring-border sm:size-20 sm:text-xl" aria-hidden="true">
                    {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="size-full object-cover" /> : userAvatarFallback(profile.displayName || profile.username)}
                </span>
                <h1 id="creator-name" className="mt-3 max-w-full truncate text-xl font-semibold sm:text-2xl">
                    {profile.displayName || profile.username}
                </h1>
                {profile.bio ? <p className="mt-2 max-w-xl whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{profile.bio}</p> : null}
                <dl className="mt-4 grid w-full max-w-md grid-cols-4 divide-x divide-border">
                    <CreatorMetric icon={<ImageIcon className="size-3.5" />} label="作品" value={profile.publishedWorkCount} />
                    <CreatorMetric icon={<Heart className="size-3.5" />} label="获赞" value={profile.receivedLikeCount} />
                    <CreatorMetric icon={<Users className="size-3.5" />} label="粉丝" value={profile.followerCount} />
                    <CreatorMetric icon={<UserPlus className="size-3.5" />} label="关注" value={profile.followingCount} />
                </dl>
                {profile.canFollow ? (
                    <Button
                        className="mt-4 !h-9 !min-w-36 !rounded-md !font-semibold !shadow-none"
                        type={profile.following ? "default" : "primary"}
                        icon={<UserPlus className="size-4" />}
                        loading={followingBusy}
                        disabled={followingBusy}
                        onClick={() => void toggleFollow()}
                    >
                        {profile.following ? "已关注" : "关注"}
                    </Button>
                ) : null}
            </section>

            <section className="min-w-0 pt-4" aria-labelledby="creator-works">
                <div className="flex h-11 items-center gap-2 border-b border-border">
                    <h2 id="creator-works" className="relative inline-flex h-11 items-center gap-1.5 px-1 text-sm font-semibold">
                        <ImageIcon className="size-4" /> 已发布
                        <span className="text-xs font-normal tabular-nums text-muted-foreground">{profile.publishedWorkCount}</span>
                        <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" />
                    </h2>
                </div>
                <ResponsiveMasonryGrid className={`mt-4 grid-cols-2 sm:grid-cols-3 ${compact ? "md:grid-cols-4 xl:grid-cols-5" : "md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6"}`} ariaLabel="创作者作品列表">
                    {items.map((item) => (
                        <PublicWorkGalleryCard key={item.slug} item={item} nextPath={nextPath} onOpen={() => onOpenWork(item.slug)} onOpenAuthor={onOpenAuthor} />
                    ))}
                </ResponsiveMasonryGrid>
                {cursor ? (
                    <div className="flex justify-center pt-3 sm:pt-5">
                        <Button className="min-w-28" loading={loadingMore} disabled={loadingMore} onClick={() => void loadMore()}>
                            加载更多
                        </Button>
                    </div>
                ) : null}
            </section>
        </div>
    );
}

function CreatorMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
    return (
        <div className="min-w-0 px-1.5 sm:px-3">
            <dd className="text-sm font-semibold tabular-nums sm:text-base">{value}</dd>
            <dt className="mt-1 flex items-center justify-center gap-1 truncate text-[10px] text-muted-foreground sm:text-xs">
                <span className="shrink-0" aria-hidden="true">
                    {icon}
                </span>
                {label}
            </dt>
        </div>
    );
}
