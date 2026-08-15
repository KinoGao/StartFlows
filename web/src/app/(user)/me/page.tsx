"use client";

import { App, Button, Input, Modal, Pagination, Spin } from "antd";
import { ExternalLink, Grid3X3, Heart, ImageIcon, Share2, UserPlus, UserRoundPen, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { SiteLogo } from "@/components/layout/site-logo";
import { ProfileAvatarUploader } from "@/components/profile/profile-avatar-uploader";
import { PublicWorkGalleryCard } from "@/components/works/public-work-gallery-card";
import { ResponsiveMasonryGrid } from "@/components/works/responsive-masonry-grid";
import { PublicWorkPreviewModal } from "@/components/works/public-work-preview-modal";
import { PublicCreatorModal } from "@/components/works/public-creator-modal";
import { useCopyText } from "@/hooks/use-copy-text";
import { userAvatarFallback } from "@/lib/user-avatar";
import { getPublicCreatorPage, listCommunityActivity, type CommunityActivityPage, type CommunityActivitySummary, type PublicCreatorPage } from "@/services/api/work-community";
import { type LocalUser, useUserStore } from "@/stores/use-user-store";
import { CommunityActivityModal, type CommunityActivityView } from "./community-activity-modal";

const PAGE_SIZE = 18;
type ProfileTab = "published" | "likes";
type LikedWorksPage = Extract<CommunityActivityPage, { view: "likes" }>;

export default function MyCreatorPage() {
    const { message } = App.useApp();
    const copyText = useCopyText();
    const user = useUserStore((state) => state.user);
    const setUser = useUserStore((state) => state.setUser);
    const [activeTab, setActiveTab] = useState<ProfileTab>("published");
    const [summary, setSummary] = useState<CommunityActivitySummary>();
    const [publishedPage, setPublishedPage] = useState<PublicCreatorPage>();
    const [publishedLoading, setPublishedLoading] = useState(true);
    const [publishedMoreLoading, setPublishedMoreLoading] = useState(false);
    const [likedPage, setLikedPage] = useState<LikedWorksPage>();
    const [likedPageNumber, setLikedPageNumber] = useState(1);
    const [likedLoading, setLikedLoading] = useState(false);
    const [previewSlug, setPreviewSlug] = useState("");
    const [creatorUsername, setCreatorUsername] = useState("");
    const [activityView, setActivityView] = useState<CommunityActivityView>();
    const [editOpen, setEditOpen] = useState(false);
    const [draftDisplayName, setDraftDisplayName] = useState("");
    const [draftBio, setDraftBio] = useState("");
    const [savingProfile, setSavingProfile] = useState(false);

    useEffect(() => {
        if (!user) return;
        setDraftDisplayName(user.displayName || user.username);
        setDraftBio(user.bio || "");
    }, [user]);

    useEffect(() => {
        if (!user?.username) return;
        let active = true;
        setPublishedLoading(true);
        void Promise.allSettled([listCommunityActivity({ view: "summary" }), getPublicCreatorPage(user.username, { limit: PAGE_SIZE })])
            .then(([summaryResult, publishedResult]) => {
                if (!active) return;
                if (summaryResult.status === "fulfilled" && summaryResult.value.view === "summary") setSummary(summaryResult.value);
                else message.error(summaryResult.status === "rejected" && summaryResult.reason instanceof Error ? summaryResult.reason.message : "主页摘要加载失败");

                if (publishedResult.status === "fulfilled") setPublishedPage(publishedResult.value);
                else setPublishedPage(undefined);
            })
            .finally(() => {
                if (active) setPublishedLoading(false);
            });
        return () => {
            active = false;
        };
    }, [message, user?.username]);

    useEffect(() => {
        if (activeTab !== "likes") return;
        let active = true;
        setLikedLoading(true);
        void listCommunityActivity({ view: "likes", page: likedPageNumber, pageSize: PAGE_SIZE })
            .then((result) => {
                if (active && result.view === "likes") setLikedPage(result);
            })
            .catch((error) => {
                if (active) message.error(error instanceof Error ? error.message : "喜欢的作品加载失败");
            })
            .finally(() => {
                if (active) setLikedLoading(false);
            });
        return () => {
            active = false;
        };
    }, [activeTab, likedPageNumber, message]);

    const loadMorePublished = useCallback(async () => {
        const cursor = publishedPage?.nextCursor;
        if (!user?.username || !cursor || publishedMoreLoading) return;
        setPublishedMoreLoading(true);
        try {
            const nextPage = await getPublicCreatorPage(user.username, { limit: PAGE_SIZE, cursor });
            setPublishedPage((current) => {
                if (!current) return nextPage;
                const known = new Set(current.items.map((item) => item.slug));
                return { profile: nextPage.profile, items: [...current.items, ...nextPage.items.filter((item) => !known.has(item.slug))], nextCursor: nextPage.nextCursor };
            });
        } catch (error) {
            message.error(error instanceof Error ? error.message : "更多作品加载失败");
        } finally {
            setPublishedMoreLoading(false);
        }
    }, [message, publishedMoreLoading, publishedPage?.nextCursor, user?.username]);

    const shareProfile = () => {
        if (!user?.username || !summary?.publicProfileAvailable) return;
        copyText(new URL(`/u/${encodeURIComponent(user.username)}`, window.location.origin).toString(), "主页链接已复制");
    };

    const syncVisibleProfile = useCallback((nextUser: LocalUser) => {
        setPublishedPage((current) => (current ? { ...current, profile: { ...current.profile, displayName: nextUser.displayName, bio: nextUser.bio, avatarUrl: nextUser.avatarUrl } } : current));
    }, []);

    const refreshCommunitySummary = useCallback(() => {
        void listCommunityActivity({ view: "summary" })
            .then((result) => {
                if (result.view === "summary") setSummary(result);
            })
            .catch((error) => message.error(error instanceof Error ? error.message : "主页摘要加载失败"));
    }, [message]);

    const saveProfile = async () => {
        if (!draftDisplayName.trim() || savingProfile) return;
        setSavingProfile(true);
        try {
            const response = await fetch("/api/auth/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ displayName: draftDisplayName.trim(), bio: draftBio.trim() }),
            });
            const payload = (await response.json().catch(() => null)) as { user?: LocalUser; error?: string } | null;
            if (!response.ok || !payload?.user) throw new Error(payload?.error || "个人资料更新失败");
            setUser(payload.user);
            syncVisibleProfile(payload.user);
            setEditOpen(false);
            message.success("个人资料已更新");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "个人资料更新失败");
        } finally {
            setSavingProfile(false);
        }
    };

    if (!user) {
        return (
            <main className="grid h-full min-h-0 place-items-center bg-background text-foreground">
                <Spin size="small" />
            </main>
        );
    }

    const publicProfile = publishedPage?.profile;
    const profileDisplayName = publicProfile?.displayName || user.displayName || user.username;
    const bio = publicProfile?.bio || user.bio;
    const avatarUrl = publicProfile?.avatarUrl || user.avatarUrl;
    const metrics = {
        published: summary?.publishedWorkCount || 0,
        liked: summary?.likedWorkCount || 0,
        following: summary?.followingCount || 0,
        followers: summary?.followerCount || 0,
    };

    return (
        <main className="h-full min-h-0 overflow-y-auto bg-background text-foreground">
            <div className="mx-auto w-full max-w-[1280px] px-3 pb-12 sm:px-6 sm:pb-16 lg:px-8">
                <section className="flex min-w-0 flex-col items-center pb-5 pt-6 text-center sm:pb-7 sm:pt-8" aria-labelledby="my-profile-name">
                    <span className="grid size-24 place-items-center overflow-hidden rounded-full bg-foreground text-xl font-semibold text-background ring-1 ring-border sm:size-28 sm:text-2xl" aria-hidden="true">
                        {avatarUrl ? <img src={avatarUrl} alt="" className="size-full object-cover" /> : userAvatarFallback(profileDisplayName)}
                    </span>
                    <div className="mt-3 grid w-fit max-w-full grid-cols-[1.5rem_minmax(0,1fr)_1.5rem] items-center gap-1.5">
                        <span aria-hidden="true" />
                        <h1 id="my-profile-name" className="truncate text-3xl font-semibold sm:text-4xl">
                            {profileDisplayName}
                        </h1>
                        <button
                            type="button"
                            className="grid size-6 -translate-y-1.5 shrink-0 place-items-center self-center text-muted-foreground transition hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label="编辑个人资料"
                            title="编辑个人资料"
                            aria-haspopup="dialog"
                            onClick={() => setEditOpen(true)}
                        >
                            <UserRoundPen className="size-3.5" />
                        </button>
                    </div>
                    {bio ? <p className="mt-2 max-w-xl whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{bio}</p> : null}
                    <div className="mt-4 grid w-full max-w-md grid-cols-4 divide-x divide-border" role="group" aria-label="主页统计">
                        <ProfileMetric label="作品" value={metrics.published} />
                        <ProfileMetric label="获赞" value={metrics.liked} onClick={() => setActivityView("likes")} />
                        <ProfileMetric label="关注" value={metrics.following} onClick={() => setActivityView("following")} />
                        <ProfileMetric label="粉丝" value={metrics.followers} onClick={() => setActivityView("followers")} />
                    </div>
                    <Button
                        className="mt-6 !h-10 !min-w-48 !rounded-md !border-stone-950 !bg-stone-950 !px-6 !text-base !font-semibold !text-white !shadow-none hover:!border-black hover:!bg-black hover:!text-white disabled:!border-border disabled:!bg-muted disabled:!text-muted-foreground dark:!border-white dark:!bg-white dark:!text-stone-950 dark:hover:!border-stone-100 dark:hover:!bg-stone-100 dark:hover:!text-stone-950"
                        icon={<Share2 className="size-4" />}
                        disabled={!summary?.publicProfileAvailable}
                        onClick={shareProfile}
                        title={summary?.publicProfileAvailable ? "复制公开主页链接" : "使用资料身份发布作品后可分享主页"}
                    >
                        {summary?.publicProfileAvailable ? "分享主页" : "主页尚未公开"}
                    </Button>
                </section>

                <section className="min-w-0 pt-4 sm:pt-5" aria-label="个人主页作品">
                    <div className="flex items-center gap-5 border-b border-border" role="tablist" aria-label="主页内容">
                        <ProfileTabButton active={activeTab === "published"} icon={<Grid3X3 className="size-4" />} label="已发布" count={metrics.published} onClick={() => setActiveTab("published")} />
                        <ProfileTabButton active={activeTab === "likes"} icon={<Heart className="size-4" />} label="我的喜欢" count={summary?.likedWorkCount || 0} onClick={() => setActiveTab("likes")} />
                    </div>

                    {activeTab === "published" ? (
                        <WorkCollection
                            loading={publishedLoading}
                            items={publishedPage?.items || []}
                            emptyTitle="暂未发布公开作品"
                            emptyDescription="使用资料身份发布并通过审核后，作品会显示在这里。"
                            emptyAction={
                                <Link href="/works" className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium transition hover:bg-muted">
                                    <ImageIcon className="size-4" /> 发布作品
                                </Link>
                            }
                            onOpen={setPreviewSlug}
                            onOpenAuthor={setCreatorUsername}
                        />
                    ) : (
                        <WorkCollection
                            loading={likedLoading}
                            items={likedPage?.items || []}
                            emptyTitle="暂未喜欢作品"
                            emptyDescription="你在作品广场点赞的公开作品会显示在这里，仅自己可见。"
                            emptyAction={
                                <Link href="/community" className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium transition hover:bg-muted">
                                    <ExternalLink className="size-4" /> 浏览作品广场
                                </Link>
                            }
                            onOpen={setPreviewSlug}
                            onOpenAuthor={setCreatorUsername}
                        />
                    )}

                    {activeTab === "published" && publishedPage?.nextCursor ? (
                        <div className="flex justify-center pt-3 sm:pt-5">
                            <Button className="min-w-28" loading={publishedMoreLoading} disabled={publishedMoreLoading} onClick={() => void loadMorePublished()}>
                                加载更多
                            </Button>
                        </div>
                    ) : null}
                    {activeTab === "likes" && likedPage && likedPage.total > PAGE_SIZE ? (
                        <Pagination className="mt-5 flex justify-center" size="small" current={likedPageNumber} pageSize={PAGE_SIZE} total={likedPage.total} showSizeChanger={false} onChange={setLikedPageNumber} />
                    ) : null}
                </section>
            </div>
            <PublicWorkPreviewModal slug={previewSlug || undefined} onClose={() => setPreviewSlug("")} onOpenCreator={setCreatorUsername} />
            <PublicCreatorModal username={creatorUsername || undefined} nextPath="/me" onClose={() => setCreatorUsername("")} />
            <CommunityActivityModal key={activityView || "closed"} view={activityView} onClose={() => setActivityView(undefined)} onChanged={refreshCommunitySummary} onOpenCreator={setCreatorUsername} onOpenWork={setPreviewSlug} />
            <Modal
                title="编辑个人主页"
                open={editOpen}
                okText="保存"
                cancelText="取消"
                confirmLoading={savingProfile}
                okButtonProps={{ disabled: !draftDisplayName.trim() }}
                destroyOnHidden
                onOk={() => void saveProfile()}
                onCancel={() => setEditOpen(false)}
            >
                <div className="pt-2">
                    <ProfileAvatarUploader onUpdated={syncVisibleProfile} />
                    <label className="mt-4 block pb-4">
                        <span className="text-sm font-medium text-foreground">昵称</span>
                        <Input className="mt-2" value={draftDisplayName} maxLength={40} showCount placeholder="输入主页显示昵称" onChange={(event) => setDraftDisplayName(event.target.value)} onPressEnter={() => void saveProfile()} />
                    </label>
                    <label className="mt-4 block">
                        <span className="text-sm font-medium text-foreground">个人简介</span>
                        <Input.TextArea className="mt-2" value={draftBio} maxLength={160} showCount autoSize={{ minRows: 3, maxRows: 5 }} placeholder="介绍你的创作方向、擅长领域或常用风格" onChange={(event) => setDraftBio(event.target.value)} />
                    </label>
                </div>
            </Modal>
        </main>
    );
}

function ProfileMetric({ label, value, onClick }: { label: string; value: number; onClick?: () => void }) {
    const Icon = label === "作品" ? ImageIcon : label === "获赞" ? Heart : label === "粉丝" ? Users : UserPlus;
    const content = (
        <>
            <span className="block text-sm font-semibold tabular-nums sm:text-base">{value}</span>
            <span className="mt-1 flex items-center justify-center gap-1 truncate text-[10px] text-muted-foreground sm:text-xs">
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                {label}
            </span>
        </>
    );
    if (onClick) {
        return (
            <button
                type="button"
                className="w-full min-w-0 rounded-md px-1.5 py-1 transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-3"
                onClick={onClick}
                aria-haspopup="dialog"
            >
                {content}
            </button>
        );
    }
    return <div className="min-w-0 px-1.5 py-1 sm:px-3">{content}</div>;
}

function ProfileTabButton({ active, icon, label, count, onClick }: { active: boolean; icon: React.ReactNode; label: string; count: number; onClick: () => void }) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            className={`relative inline-flex h-11 items-center gap-1.5 px-1 text-sm font-medium transition ${active ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            onClick={onClick}
        >
            {icon}
            {label}
            <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
            {active ? <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-foreground" /> : null}
        </button>
    );
}

function WorkCollection({
    loading,
    items,
    emptyTitle,
    emptyDescription,
    emptyAction,
    onOpen,
    onOpenAuthor,
}: {
    loading: boolean;
    items: PublicCreatorPage["items"];
    emptyTitle: string;
    emptyDescription: string;
    emptyAction: React.ReactNode;
    onOpen: (slug: string) => void;
    onOpenAuthor: (username: string) => void;
}) {
    if (loading && !items.length) {
        return (
            <div className="grid min-h-48 place-items-center">
                <Spin size="small" />
            </div>
        );
    }
    if (!items.length) {
        return (
            <div className="flex min-h-52 flex-col items-center justify-center px-4 text-center">
                <SiteLogo logoUrl="/logo.svg" className="size-9 opacity-35" />
                <h2 className="mt-3 text-sm font-semibold">{emptyTitle}</h2>
                <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">{emptyDescription}</p>
                <div className="mt-4">{emptyAction}</div>
            </div>
        );
    }
    return (
        <ResponsiveMasonryGrid className="mt-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6" ariaLabel="个人作品列表">
            {items.map((item) => (
                <PublicWorkGalleryCard key={item.slug} item={item} nextPath="/me" onOpen={() => onOpen(item.slug)} onOpenAuthor={onOpenAuthor} />
            ))}
        </ResponsiveMasonryGrid>
    );
}
