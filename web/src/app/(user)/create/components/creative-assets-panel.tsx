"use client";

import { Button, Drawer, Dropdown, Grid, Input, Modal, Spin, Tabs, Tooltip } from "antd";
import { AtSign, ChevronDown, CornerDownLeft, FileVideo, ImageIcon, LibraryBig, ListFilter, Play, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { LazyMediaImage } from "@/components/media/lazy-media-image";
import type { CreativeAsset } from "@/lib/creative-runtime-contract";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { listMyPrompts } from "@/services/api/my-prompts";
import { ALL_PROMPTS_OPTION, fetchPrompts, promptCategoryLabel, type Prompt } from "@/services/api/prompts";

type PromptCollection = {
    items: Prompt[];
    page: number;
    total: number;
    loading: boolean;
    loaded: boolean;
    error: string;
    categories: string[];
};
type AssetPanelTab = "assets" | "my" | "library";
type PanelPreview = { type: "image" | "video"; url: string; title: string; posterUrl?: string };

const emptyPromptCollection = (): PromptCollection => ({ items: [], page: 0, total: 0, loading: false, loaded: false, error: "", categories: [] });
const resetPromptCollection = (current: PromptCollection): PromptCollection => ({ ...emptyPromptCollection(), categories: current.categories });

export function CreativeAssetsPanel({
    open,
    conversationId,
    assets,
    selectedAssetIds,
    onToggleAsset,
    onUsePrompt,
    onClose,
}: {
    open: boolean;
    conversationId?: string;
    assets: CreativeAsset[];
    selectedAssetIds: string[];
    onToggleAsset: (id: string) => void;
    onUsePrompt: (prompt: string) => void;
    onClose: () => void;
}) {
    const screens = Grid.useBreakpoint();
    const [activeTab, setActiveTab] = useState<AssetPanelTab>("assets");
    const [myPrompts, setMyPrompts] = useState(emptyPromptCollection);
    const [libraryPrompts, setLibraryPrompts] = useState(emptyPromptCollection);
    const [myPromptCategory, setMyPromptCategory] = useState(ALL_PROMPTS_OPTION);
    const [libraryPromptCategory, setLibraryPromptCategory] = useState(ALL_PROMPTS_OPTION);
    const [myPromptKeyword, setMyPromptKeyword] = useState("");
    const [libraryPromptKeyword, setLibraryPromptKeyword] = useState("");
    const [preview, setPreview] = useState<PanelPreview>();
    const inFlightRef = useRef(new Set<string>());
    const mediaAssets = assets.filter((asset) => asset.status === "ready" && (asset.type === "image" || asset.type === "video"));

    const loadPromptPage = useCallback(async (kind: "my" | "library", page: number, category: string, keyword: string) => {
        const requestKey = `${kind}:${category}:${keyword}:${page}`;
        if (inFlightRef.current.has(requestKey)) return;
        inFlightRef.current.add(requestKey);
        const setCollection = kind === "my" ? setMyPrompts : setLibraryPrompts;
        setCollection((current) => ({ ...current, loading: true, error: "" }));
        try {
            const includeFacets = page === 1;
            const payload = kind === "my" ? await listMyPrompts({ page, category, keyword, includeFacets }) : await fetchPrompts({ page, category, keyword, includeFacets });
            setCollection((current) => ({
                items: page === 1 ? payload.items : uniquePrompts([...current.items, ...payload.items]),
                page,
                total: payload.total,
                categories: page === 1 ? payload.categories : current.categories,
                loading: false,
                loaded: true,
                error: "",
            }));
        } catch (error) {
            setCollection((current) => ({ ...current, loading: false, loaded: true, error: error instanceof Error ? error.message : "提示词加载失败" }));
        } finally {
            inFlightRef.current.delete(requestKey);
        }
    }, []);

    useEffect(() => {
        if (!open || activeTab === "assets") return;
        const collection = activeTab === "my" ? myPrompts : libraryPrompts;
        const category = activeTab === "my" ? myPromptCategory : libraryPromptCategory;
        const keyword = activeTab === "my" ? myPromptKeyword : libraryPromptKeyword;
        if (!collection.loaded && !collection.loading) void loadPromptPage(activeTab, 1, category, keyword);
    }, [activeTab, libraryPromptCategory, libraryPromptKeyword, libraryPrompts, loadPromptPage, myPromptCategory, myPromptKeyword, myPrompts, open]);

    const panel = (
        <div className="flex h-full min-h-0 flex-col bg-white dark:bg-[#15181c]">
            <div className="hidden h-14 shrink-0 items-center gap-2 border-b border-[#eceef1] px-4 lg:flex dark:border-[#2b3036]">
                <LibraryBig className="size-4 text-[#5b61cf] dark:text-[#b4b7ff]" />
                <h2 className="min-w-0 flex-1 text-sm font-semibold text-[#20242a] dark:text-[#f3f5f7]">资产</h2>
                <Tooltip title="关闭资产面板">
                    <Button type="text" shape="circle" icon={<X className="size-4" />} onClick={onClose} aria-label="关闭资产面板" />
                </Tooltip>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">
                <Tabs
                    activeKey={activeTab}
                    onChange={(key) => setActiveTab(key as AssetPanelTab)}
                    tabBarGutter={0}
                    className="creative-assets-tabs !flex !h-full !min-h-0 !flex-col px-3 [&_.ant-tabs-body-holder]:!min-h-0 [&_.ant-tabs-body-holder]:!flex-1 [&_.ant-tabs-body-holder]:!overflow-hidden [&_.ant-tabs-body]:!h-full [&_.ant-tabs-body]:!min-h-0 [&_.ant-tabs-content]:!h-full [&_.ant-tabs-content]:!min-h-0 [&_.ant-tabs-ink-bar]:!bg-[#6268d8] [&_.ant-tabs-nav-list]:w-full [&_.ant-tabs-nav]:!shrink-0 [&_.ant-tabs-tab]:!mx-0 [&_.ant-tabs-tab]:!flex-1 [&_.ant-tabs-tab]:!justify-center [&_.ant-tabs-tab]:!px-1 [&_.ant-tabs-tab-btn]:!text-[#747d88] [&_.ant-tabs-tab-active_.ant-tabs-tab-btn]:!text-[#555bc7] [&_.ant-tabs-tab-active_.ant-tabs-tab-btn]:dark:!text-[#b7baff] [&_.ant-tabs-tab-btn]:dark:!text-[#959eaa] [&_.ant-tabs-tabpane]:!h-full [&_.ant-tabs-tabpane]:!min-h-0 [&_.ant-tabs-tabpane]:!overflow-hidden"
                    items={[
                        {
                            key: "assets",
                            label: <TabLabel text="当前对话" count={mediaAssets.length} />,
                            children: <ConversationAssets conversationId={conversationId} assets={mediaAssets} selectedAssetIds={selectedAssetIds} onToggle={onToggleAsset} onPreview={setPreview} />,
                        },
                        {
                            key: "my",
                            label: <TabLabel text="我的提示词" count={myPrompts.loaded ? myPrompts.total : undefined} />,
                            children: (
                                <PromptList
                                    collection={myPrompts}
                                    activeCategory={myPromptCategory}
                                    keyword={myPromptKeyword}
                                    onSearch={(keyword) => {
                                        setMyPromptKeyword(keyword);
                                        setMyPrompts(resetPromptCollection);
                                    }}
                                    onCategoryChange={(category) => {
                                        setMyPromptCategory(category);
                                        setMyPrompts(resetPromptCollection);
                                    }}
                                    onPreview={setPreview}
                                    onUse={onUsePrompt}
                                    onRetry={() => void loadPromptPage("my", 1, myPromptCategory, myPromptKeyword)}
                                    onLoadMore={() => void loadPromptPage("my", myPrompts.page + 1, myPromptCategory, myPromptKeyword)}
                                />
                            ),
                        },
                        {
                            key: "library",
                            label: <TabLabel text="提示词库" count={libraryPrompts.loaded ? libraryPrompts.total : undefined} />,
                            children: (
                                <PromptList
                                    collection={libraryPrompts}
                                    activeCategory={libraryPromptCategory}
                                    keyword={libraryPromptKeyword}
                                    onSearch={(keyword) => {
                                        setLibraryPromptKeyword(keyword);
                                        setLibraryPrompts(resetPromptCollection);
                                    }}
                                    onCategoryChange={(category) => {
                                        setLibraryPromptCategory(category);
                                        setLibraryPrompts(resetPromptCollection);
                                    }}
                                    onPreview={setPreview}
                                    onUse={onUsePrompt}
                                    onRetry={() => void loadPromptPage("library", 1, libraryPromptCategory, libraryPromptKeyword)}
                                    onLoadMore={() => void loadPromptPage("library", libraryPrompts.page + 1, libraryPromptCategory, libraryPromptKeyword)}
                                />
                            ),
                        },
                    ]}
                />
            </div>
        </div>
    );

    return (
        <>
            {open && screens.lg ? <aside className="h-full min-h-0 w-[352px] shrink-0 border-l border-[#eceef1] dark:border-[#2b3036]">{panel}</aside> : null}
            <Drawer title="资产" placement="right" size={360} open={open && screens.lg !== true} onClose={onClose} styles={{ wrapper: { maxWidth: "100vw" }, body: { height: "100%", padding: 0, overflow: "hidden" } }}>
                {screens.lg !== true ? panel : null}
            </Drawer>
            <AssetPreviewModal preview={preview} onClose={() => setPreview(undefined)} />
        </>
    );
}

export function ConversationAssets({
    conversationId,
    assets,
    selectedAssetIds,
    onToggle,
    onPreview,
}: {
    conversationId?: string;
    assets: CreativeAsset[];
    selectedAssetIds: string[];
    onToggle: (id: string) => void;
    onPreview: (preview: PanelPreview) => void;
}) {
    const [activeType, setActiveType] = useState<"image" | "video">("image");
    if (!conversationId || !assets.length) return <PanelEmpty icon={<ImageIcon className="size-5" />} text="当前对话还没有资产" />;
    const imageAssets = assets.filter((asset) => asset.type === "image");
    const videoAssets = assets.filter((asset) => asset.type === "video");
    const visibleType = activeType === "image" && imageAssets.length ? "image" : activeType === "video" && videoAssets.length ? "video" : imageAssets.length ? "image" : "video";
    const visibleAssets = visibleType === "image" ? imageAssets : videoAssets;
    const selected = new Set(selectedAssetIds);
    return (
        <div className="flex h-full min-h-0 flex-col" data-testid="creative-conversation-assets">
            <div className="mx-3 mb-2 grid grid-cols-2 gap-1 rounded-lg border border-[#e4e7eb] bg-[#f5f6f8] p-1 dark:border-[#343a42] dark:bg-[#20242a]" role="tablist" aria-label="当前对话资产类型">
                <ConversationAssetTypeTab label="图片" count={imageAssets.length} active={visibleType === "image"} disabled={!imageAssets.length} onClick={() => setActiveType("image")} />
                <ConversationAssetTypeTab label="视频" count={videoAssets.length} active={visibleType === "video"} disabled={!videoAssets.length} onClick={() => setActiveType("video")} />
            </div>
            <div className="hide-scrollbar grid min-h-0 flex-1 auto-rows-max grid-cols-4 gap-2 overflow-y-auto px-3 pb-4" data-testid={`creative-conversation-${visibleType}-assets`}>
                {visibleAssets.map((asset) => {
                    const active = selected.has(asset.id);
                    return (
                        <article key={asset.id} className="group min-w-0" title={asset.title}>
                            <div
                                className={`relative aspect-square overflow-hidden rounded-md border-2 transition ${
                                    active ? "border-[#6268d8] bg-[#f1f1ff] dark:border-[#9ca0ff] dark:bg-[#292b47]" : "border-transparent bg-[#f1f3f5] group-hover:border-[#c9ccef] dark:bg-[#24282e] dark:group-hover:border-[#666b9c]"
                                }`}
                            >
                                <button
                                    type="button"
                                    className="block size-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#6268d8]"
                                    onClick={() => {
                                        const url = asset.serverUrl || asset.remoteUrl;
                                        if (!url || (asset.type !== "image" && asset.type !== "video")) return;
                                        const posterUrl = typeof asset.metadata.coverUrl === "string" ? asset.metadata.coverUrl : undefined;
                                        onPreview({ type: asset.type, url, title: asset.title, posterUrl });
                                    }}
                                    aria-label={`展开查看${asset.title}`}
                                >
                                    <AssetPreview asset={asset} />
                                </button>
                                {asset.type === "video" ? (
                                    <span className="pointer-events-none absolute bottom-1.5 left-1.5 grid size-6 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm">
                                        <Play className="ml-0.5 size-3 fill-current" />
                                    </span>
                                ) : null}
                            </div>
                            <button
                                type="button"
                                data-testid="creative-asset-reference-action"
                                className={`mt-1 flex h-5 w-full items-center justify-center gap-1 rounded-sm !bg-transparent !text-[11px] font-medium transition-colors hover:!bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6268d8] ${
                                    active ? "!text-[#555bc7] dark:!text-[#c3c5ff]" : "!text-[#68727e] hover:!text-[#555bc7] dark:!text-[#aab3bd] dark:hover:!text-[#c3c5ff]"
                                }`}
                                onClick={() => onToggle(asset.id)}
                                aria-pressed={active}
                                aria-label={`${active ? "取消引用" : "引用"}${asset.title}`}
                                title={active ? "取消引用" : "引用"}
                            >
                                <AtSign className="size-3" aria-hidden="true" />
                                {active ? "已引用" : "引用"}
                            </button>
                        </article>
                    );
                })}
            </div>
        </div>
    );
}

function ConversationAssetTypeTab({ label, count, active, disabled, onClick }: { label: "图片" | "视频"; count: number; active: boolean; disabled: boolean; onClick: () => void }) {
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            className={`flex h-8 items-center justify-center gap-1 rounded-md text-xs font-medium transition ${
                active
                    ? "bg-white text-[#555bc7] shadow-[0_1px_3px_rgba(32,36,42,0.08)] dark:bg-[#30343b] dark:text-[#c3c5ff]"
                    : "text-[#68727e] hover:bg-white/70 hover:text-[#303844] disabled:cursor-default disabled:opacity-35 dark:text-[#aab3bd] dark:hover:bg-[#2a2f36] dark:hover:text-white"
            }`}
            onClick={onClick}
        >
            {label}
            <span className="text-[10px] font-normal opacity-60">{count}</span>
        </button>
    );
}

export function PromptList({
    collection,
    activeCategory,
    keyword,
    onSearch,
    onCategoryChange,
    onPreview,
    onUse,
    onRetry,
    onLoadMore,
}: {
    collection: PromptCollection;
    activeCategory: string;
    keyword: string;
    onSearch: (keyword: string) => void;
    onCategoryChange: (category: string) => void;
    onPreview: (preview: PanelPreview) => void;
    onUse: (prompt: string) => void;
    onRetry: () => void;
    onLoadMore: () => void;
}) {
    const [searchValue, setSearchValue] = useState(keyword);

    useEffect(() => setSearchValue(keyword), [keyword]);

    const hasMore = collection.items.length < collection.total;
    const categories = [ALL_PROMPTS_OPTION, ...collection.categories];
    return (
        <div data-testid="creative-prompt-scroll" className="hide-scrollbar h-full min-h-0 overflow-y-auto overscroll-contain px-3 pb-4">
            <div className="sticky top-0 z-20 mb-2 flex min-w-0 gap-1.5 bg-white pb-2 dark:bg-[#15181c]">
                <Input
                    value={searchValue}
                    allowClear
                    prefix={
                        <button type="button" className="grid size-6 place-items-center text-[#7a8490] transition hover:text-[#555bc7] dark:text-[#929ca8] dark:hover:text-[#c3c5ff]" onClick={() => onSearch(searchValue.trim())} aria-label="搜索提示词">
                            <Search className="size-4" />
                        </button>
                    }
                    placeholder="搜索提示词"
                    className="min-w-0 flex-1 !rounded-md [&_.ant-input]:!text-xs"
                    onChange={(event) => {
                        const next = event.target.value;
                        setSearchValue(next);
                        if (!next && keyword) onSearch("");
                    }}
                    onPressEnter={() => onSearch(searchValue.trim())}
                    aria-label="搜索提示词"
                />
                {collection.categories.length ? (
                    <Dropdown
                        trigger={["click"]}
                        popupRender={(menu) => (
                            <div className="[&_.ant-dropdown-menu]:!rounded-md [&_.ant-dropdown-menu]:!border [&_.ant-dropdown-menu]:!border-[#e3e7eb] [&_.ant-dropdown-menu]:!p-1 [&_.ant-dropdown-menu]:!shadow-[0_10px_28px_rgba(31,35,41,0.12)] [&_.ant-dropdown-menu-item]:!min-h-8 [&_.ant-dropdown-menu-item]:!rounded [&_.ant-dropdown-menu-item]:!px-2.5 [&_.ant-dropdown-menu-item]:!text-xs [&_.ant-dropdown-menu-item-active]:!bg-[#f3f5f7] [&_.ant-dropdown-menu-item:hover]:!bg-[#f3f5f7] dark:[&_.ant-dropdown-menu]:!border-[#343a42] dark:[&_.ant-dropdown-menu]:!bg-[#20242a] dark:[&_.ant-dropdown-menu-item]:!text-[#c8cfd7] dark:[&_.ant-dropdown-menu-item-active]:!bg-[#2b3036] dark:[&_.ant-dropdown-menu-item:hover]:!bg-[#2b3036]">
                                {menu}
                            </div>
                        )}
                        menu={{
                            items: categories.map((category) => ({ key: category, label: promptCategoryLabel(category) })),
                            onClick: ({ key }) => onCategoryChange(key),
                        }}
                    >
                        <button
                            type="button"
                            className="flex h-8 max-w-28 shrink-0 items-center gap-1.5 rounded-md border border-[#e1e5e9] bg-transparent px-2.5 text-xs font-medium text-[#596572] transition hover:border-[#bec2eb] hover:bg-[#f7f7ff] hover:text-[#4f55bd] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6268d8] dark:border-[#343a42] dark:text-[#b4bdc7] dark:hover:border-[#666b9c] dark:hover:bg-[#24263e] dark:hover:text-[#c3c5ff]"
                            aria-label="提示词分类"
                        >
                            <ListFilter className="size-3.5 shrink-0 text-[#6268d8] dark:text-[#b7baff]" />
                            <span className="truncate">{promptCategoryLabel(activeCategory)}</span>
                            <ChevronDown className="size-3.5 shrink-0 opacity-55" />
                        </button>
                    </Dropdown>
                ) : null}
            </div>
            {collection.loading && !collection.items.length ? (
                <div className="grid h-48 place-items-center">
                    <Spin size="small" />
                </div>
            ) : collection.error && !collection.items.length ? (
                <PanelEmpty
                    icon={<RefreshCw className="size-5" />}
                    text={collection.error}
                    action={
                        <Button size="small" type="text" icon={<RefreshCw className="size-3.5" />} onClick={onRetry}>
                            重新加载
                        </Button>
                    }
                />
            ) : !collection.items.length ? (
                <PanelEmpty icon={<Sparkles className="size-5" />} text="暂无可用提示词" />
            ) : (
                <>
                    <div className="grid grid-cols-4 gap-1.5" data-testid="creative-prompt-thumbnails">
                        {collection.items.map((item) => (
                            <article key={item.id} className="group min-w-0" title={item.title}>
                                <div className="aspect-square overflow-hidden rounded-md border border-[#e3e7eb] bg-[#f1f3f5] dark:border-[#30363e] dark:bg-[#24282e]">
                                    {item.coverUrl ? (
                                        <button
                                            type="button"
                                            className="block size-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#6268d8]"
                                            onClick={() => onPreview({ type: "image", url: item.coverUrl, title: item.title })}
                                            aria-label={`展开查看${item.title}`}
                                        >
                                            <LazyMediaImage src={imagePreviewUrl(item.coverUrl, 480)} alt="" containerClassName="size-full" imageClassName="size-full object-cover transition-transform duration-200 group-hover:scale-[1.02]" />
                                        </button>
                                    ) : (
                                        <span className="grid size-full place-items-center text-[#929ba6] dark:text-[#78828e]" aria-hidden="true">
                                            <Sparkles className="size-5" />
                                        </span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    data-testid="creative-prompt-insert-action"
                                    className="mt-1 flex h-5 w-full items-center justify-center gap-1 rounded-sm !bg-transparent !text-[11px] !text-[#68727e] font-medium transition-colors hover:!bg-transparent hover:!text-[#555bc7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6268d8] dark:!text-[#aab3bd] dark:hover:!text-[#c3c5ff]"
                                    onClick={() => onUse(item.prompt)}
                                    aria-label={`插入：${item.title}`}
                                >
                                    <CornerDownLeft className="size-3" aria-hidden="true" />
                                    插入
                                </button>
                            </article>
                        ))}
                    </div>
                    {hasMore ? (
                        <Button block type="text" size="small" loading={collection.loading} className="!mt-2 !text-xs" onClick={onLoadMore}>
                            加载更多
                        </Button>
                    ) : null}
                </>
            )}
        </div>
    );
}

function PanelEmpty({ icon, text, action }: { icon: React.ReactNode; text: string; action?: React.ReactNode }) {
    return (
        <div className="flex h-48 flex-col items-center justify-center gap-2 px-5 text-center text-xs text-[#8b949f] dark:text-[#7f8996]">
            <span className="grid size-10 place-items-center rounded-md bg-[#f0f0ff] text-[#6066d2] dark:bg-[#2b2d49] dark:text-[#b7baff]">{icon}</span>
            <span>{text}</span>
            {action}
        </div>
    );
}

function AssetPreview({ asset }: { asset: CreativeAsset }) {
    const url = asset.serverUrl || asset.remoteUrl;
    if (asset.type === "image" && url) return <img src={imagePreviewUrl(url, 320)} alt="" className="size-full object-cover" loading="lazy" />;
    const coverUrl = typeof asset.metadata.coverUrl === "string" ? asset.metadata.coverUrl : "";
    if (asset.type === "video" && coverUrl) return <img src={imagePreviewUrl(coverUrl, 320)} alt="" className="size-full object-cover" loading="lazy" />;
    if (asset.type === "video" && url) return <video src={url} aria-label={asset.title} className="size-full bg-black object-cover" muted playsInline preload="metadata" />;
    const Icon = asset.type === "video" ? FileVideo : ImageIcon;
    return (
        <span className="grid size-full place-items-center text-[#7b8490] dark:text-[#aab3bf]">
            <Icon className="size-5" />
        </span>
    );
}

function AssetPreviewModal({ preview, onClose }: { preview?: PanelPreview; onClose: () => void }) {
    return (
        <Modal title="预览" open={Boolean(preview)} footer={null} centered width="fit-content" destroyOnHidden onCancel={onClose} style={{ maxWidth: "calc(100vw - 32px)" }}>
            <div className="overflow-hidden rounded-md border border-[#e3e7eb] bg-white dark:border-[#343a42] dark:bg-[#111316]">
                {preview?.type === "image" ? <img src={imagePreviewUrl(preview.url, 2048)} alt={preview.title} className="block h-auto max-h-[78dvh] w-auto max-w-[calc(100vw-80px)] object-contain" /> : null}
                {preview?.type === "video" ? (
                    <video
                        src={preview.url}
                        poster={preview.posterUrl ? imagePreviewUrl(preview.posterUrl, 1280) : undefined}
                        aria-label={preview.title}
                        className="block h-auto max-h-[78dvh] w-auto max-w-[calc(100vw-80px)] bg-black object-contain"
                        controls
                        autoPlay
                        playsInline
                        preload="metadata"
                    />
                ) : null}
            </div>
        </Modal>
    );
}

function uniquePrompts(items: Prompt[]) {
    return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

function TabLabel({ text, count }: { text: string; count?: number }) {
    return (
        <span className="inline-flex items-center gap-1 text-xs font-medium">
            {text}
            {count ? <span className="text-[10px] font-normal opacity-55">{count}</span> : null}
        </span>
    );
}
