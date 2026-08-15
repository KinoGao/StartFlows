"use client";

import { App, Button, Modal, Pagination, Spin } from "antd";
import { Ban, Heart, UserMinus, Video } from "lucide-react";
import { useEffect, useState } from "react";

import { CompactEmptyState } from "@/components/compact-empty-state";
import { LazyMediaImage } from "@/components/media/lazy-media-image";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { userAvatarFallback } from "@/lib/user-avatar";
import { listCommunityActivity, setPublicCreatorFollow, setPublicUserBlock, setWorkLike, type CommunityActivityPage, type CommunityActivitySummary, type CommunityUser } from "@/services/api/work-community";
import type { PublicGalleryItem } from "@/services/api/work-governance";

const PAGE_SIZE = 12;

export type CommunityActivityView = "following" | "followers" | "likes";
type ActivityPage = Exclude<CommunityActivityPage, CommunityActivitySummary>;

const MODAL_META: Record<CommunityActivityView, { title: string; emptyTitle: string; emptyDescription: string }> = {
    following: { title: "关注作者", emptyTitle: "暂未关注作者", emptyDescription: "在作品详情或创作者主页关注的作者会显示在这里。" },
    followers: { title: "我的粉丝", emptyTitle: "暂时没有粉丝", emptyDescription: "其他用户关注你后会显示在这里。" },
    likes: { title: "点赞作品", emptyTitle: "暂未点赞作品", emptyDescription: "你在作品广场赞过的公开作品会显示在这里。" },
};

export function CommunityActivityModal({ view, onClose, onChanged, onOpenCreator, onOpenWork }: { view?: CommunityActivityView; onClose: () => void; onChanged: () => void; onOpenCreator: (username: string) => void; onOpenWork: (slug: string) => void }) {
    const { message, modal } = App.useApp();
    const [page, setPage] = useState(1);
    const [activityPage, setActivityPage] = useState<ActivityPage>();
    const [loading, setLoading] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [actionKey, setActionKey] = useState("");

    useEffect(() => {
        if (!view) return;
        let active = true;
        setLoading(true);
        void listCommunityActivity({ view, page, pageSize: PAGE_SIZE })
            .then((result) => {
                if (active && result.view !== "summary") setActivityPage(result);
            })
            .catch((error) => {
                if (active) message.error(error instanceof Error ? error.message : "社区记录加载失败");
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [message, page, refreshKey, view]);

    const refresh = () => {
        setRefreshKey((value) => value + 1);
        onChanged();
    };

    const unfollow = async (item: CommunityUser) => {
        const key = `unfollow:${item.username}`;
        setActionKey(key);
        try {
            await setPublicCreatorFollow(item.username, false);
            message.success("已取消关注");
            refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "取消关注失败");
        } finally {
            setActionKey("");
        }
    };

    const unlike = async (item: PublicGalleryItem) => {
        const key = `unlike:${item.slug}`;
        setActionKey(key);
        try {
            await setWorkLike(item.slug, false);
            message.success("已取消点赞");
            refresh();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "取消点赞失败");
        } finally {
            setActionKey("");
        }
    };

    const confirmBlock = (item: CommunityUser) => {
        modal.confirm({
            title: `拉黑 ${item.displayName || item.username}`,
            content: "拉黑后将解除双方关注，双方无法再次关注。",
            okText: "拉黑",
            cancelText: "取消",
            okButtonProps: { danger: true },
            onOk: async () => {
                const key = `block:${item.username}`;
                setActionKey(key);
                try {
                    await setPublicUserBlock(item.username, true);
                    message.success("已拉黑用户");
                    refresh();
                } catch (error) {
                    message.error(error instanceof Error ? error.message : "拉黑失败");
                    throw error;
                } finally {
                    setActionKey("");
                }
            },
        });
    };

    const openCreator = (username: string) => {
        onClose();
        onOpenCreator(username);
    };

    const openWork = (slug: string) => {
        onClose();
        onOpenWork(slug);
    };

    return (
        <Modal open={Boolean(view)} title={view ? MODAL_META[view].title : "社区记录"} width={640} centered footer={null} destroyOnHidden onCancel={onClose} styles={{ body: { maxHeight: "min(64vh, 620px)", overflowY: "auto", padding: "12px 0 0" } }}>
            <div className="min-h-40">
                {loading && !activityPage ? (
                    <div className="grid min-h-40 place-items-center">
                        <Spin size="small" />
                    </div>
                ) : null}
                {view && activityPage?.view === view && activityPage.items.length ? (
                    view === "likes" ? (
                        <LikedWorkList items={activityPage.items as Array<PublicGalleryItem & { likedAt: string }>} actionKey={actionKey} onOpen={openWork} onUnlike={unlike} />
                    ) : (
                        <CommunityUserList items={activityPage.items as CommunityUser[]} relation={view} actionKey={actionKey} onOpenProfile={openCreator} onUnfollow={unfollow} onBlock={confirmBlock} />
                    )
                ) : null}
                {!loading && view && activityPage?.view === view && !activityPage.items.length ? <CompactEmptyState title={MODAL_META[view].emptyTitle} description={MODAL_META[view].emptyDescription} /> : null}
            </div>
            {view && activityPage?.view === view && activityPage.total > PAGE_SIZE ? <Pagination className="mt-4" size="small" current={page} pageSize={PAGE_SIZE} total={activityPage.total} showSizeChanger={false} onChange={setPage} /> : null}
        </Modal>
    );
}

function CommunityUserList({
    items,
    relation,
    actionKey,
    onOpenProfile,
    onUnfollow,
    onBlock,
}: {
    items: CommunityUser[];
    relation: "following" | "followers";
    actionKey: string;
    onOpenProfile: (username: string) => void;
    onUnfollow: (item: CommunityUser) => void;
    onBlock: (item: CommunityUser) => void;
}) {
    return (
        <div className="divide-y divide-border">
            {items.map((item) => {
                const identity = (
                    <>
                        <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-foreground text-xs font-semibold text-background">
                            {item.avatarUrl ? <img src={item.avatarUrl} alt="" className="size-full object-cover" loading="lazy" /> : userAvatarFallback(item.displayName || item.username)}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-foreground">{item.displayName || item.username}</span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                @{item.username} · {item.followerCount} 位关注者
                            </span>
                            {item.bio ? <span className="mt-1 line-clamp-1 block text-xs text-muted-foreground">{item.bio}</span> : null}
                        </span>
                    </>
                );
                return (
                    <div key={item.username} className="flex min-w-0 items-center gap-2 py-3 first:pt-0 last:pb-0 sm:gap-3">
                        {item.publicProfileAvailable ? (
                            <button type="button" className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onOpenProfile(item.username)}>
                                {identity}
                            </button>
                        ) : (
                            <div className="flex min-w-0 flex-1 items-center gap-3">{identity}</div>
                        )}
                        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                            <time className="hidden text-[10px] text-muted-foreground md:block" title={relation === "following" ? "关注时间" : "成为粉丝时间"}>
                                {formatShortTime(item.relatedAt)}
                            </time>
                            {relation === "following" ? (
                                <Button type="text" size="small" icon={<UserMinus className="size-3.5" />} loading={actionKey === `unfollow:${item.username}`} disabled={Boolean(actionKey)} onClick={() => onUnfollow(item)}>
                                    取关
                                </Button>
                            ) : null}
                            <Button type="text" danger size="small" icon={<Ban className="size-3.5" />} loading={actionKey === `block:${item.username}`} disabled={Boolean(actionKey)} onClick={() => onBlock(item)}>
                                拉黑
                            </Button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function LikedWorkList({ items, actionKey, onOpen, onUnlike }: { items: Array<PublicGalleryItem & { likedAt: string }>; actionKey: string; onOpen: (slug: string) => void; onUnlike: (item: PublicGalleryItem) => void }) {
    return (
        <div className="divide-y divide-border">
            {items.map((item) => (
                <div key={item.slug} className="flex min-w-0 items-center gap-2 py-3 first:pt-0 last:pb-0">
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onOpen(item.slug)}>
                        <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground">
                            {item.preview?.mediaType === "image" ? <LazyMediaImage src={imagePreviewUrl(item.preview.url, 192)} alt="" containerClassName="size-full" imageClassName="size-full object-cover" /> : <Video className="size-5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="line-clamp-2 block text-sm font-semibold leading-5 text-foreground">{item.title}</span>
                            <span className="mt-1 block truncate text-xs text-muted-foreground">{item.authorName || "匿名作者"}</span>
                            <span className="mt-1 block text-[10px] text-muted-foreground">点赞于 {formatShortTime(item.likedAt)}</span>
                        </span>
                    </button>
                    <Button type="text" danger size="small" icon={<Heart className="size-3.5 fill-current" />} loading={actionKey === `unlike:${item.slug}`} disabled={Boolean(actionKey)} onClick={() => onUnlike(item)}>
                        取消点赞
                    </Button>
                </div>
            ))}
        </div>
    );
}

function formatShortTime(value: string) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "-";
    return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
