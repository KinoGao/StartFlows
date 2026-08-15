"use client";

import { App, Button, Dropdown, Image, Input, Popconfirm, Select, Tooltip } from "antd";
import { ArrowDownUp, ChevronDown, ChevronRight, Download, FileText, ImagePlus, Images, KeyRound, MapPinned, Package, Plus, RotateCcw, Search, Trash2, Users, Video } from "lucide-react";
import { useMemo, useState } from "react";

import { AgentMediaPreview } from "@/components/agent/agent-media-preview";
import type { DramaEpisode, DramaProject } from "@/lib/drama-project-contract";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { useDramaStore } from "../stores/use-drama-store";
import { type DramaAssetFilter, type DramaAssetLibraryRow, type DramaAssetSort, buildDramaAssetLibraryRows, filterAndSortDramaAssets } from "./drama-asset-library-utils";
import { DRAMA_ASSET_DEFINITIONS, type DramaAssetKind } from "./drama-asset-definitions";
import { DramaAssetEditorDrawer } from "./drama-asset-editor-drawer";
import { downloadDramaAssetBundle } from "./drama-asset-export";
import { dramaAssetReferences } from "./drama-asset-reference-utils";

export { imageResultsToReferences } from "./drama-asset-reference-utils";

const assetKinds: DramaAssetKind[] = ["characters", "scenes", "props", "clues"];
const assetIcons = { characters: Users, scenes: MapPinned, props: Package, clues: KeyRound } satisfies Record<DramaAssetKind, typeof Users>;
const filterOptions: Array<{ value: DramaAssetFilter; label: string }> = [
    { value: "all", label: "全部状态" },
    { value: "current-episode", label: "当前集涉及" },
    { value: "missing-reference", label: "待补基准" },
    { value: "incomplete", label: "设定待补" },
    { value: "used", label: "已被引用" },
    { value: "unused", label: "未被引用" },
];
const sortLabels: Record<DramaAssetSort, string> = { default: "默认顺序", attention: "待完善优先", usage: "引用最多", name: "按名称" };

export function DramaAssetsPanel({ project, episode }: { project: DramaProject; episode: DramaEpisode }) {
    const { message } = App.useApp();
    const removeAsset = useDramaStore((state) => state.removeAsset);
    const [activeKind, setActiveKind] = useState<DramaAssetKind>("characters");
    const [query, setQuery] = useState("");
    const [filter, setFilter] = useState<DramaAssetFilter>("all");
    const [sort, setSort] = useState<DramaAssetSort>("default");
    const [exporting, setExporting] = useState(false);
    const [editor, setEditor] = useState<{ kind: DramaAssetKind; assetId?: string }>();
    const definition = DRAMA_ASSET_DEFINITIONS[activeKind];
    const rows = useMemo(() => buildDramaAssetLibraryRows(project, episode, activeKind), [activeKind, episode, project]);
    const visibleRows = useMemo(() => filterAndSortDramaAssets(rows, filter, sort, query), [filter, query, rows, sort]);
    const hasActiveFilter = Boolean(query.trim()) || filter !== "all";

    const resetFilters = () => {
        setQuery("");
        setFilter("all");
    };

    const exportAssets = async () => {
        setExporting(true);
        try {
            const result = await downloadDramaAssetBundle(project);
            if (!result.exported) message.info("当前项目还没有可下载的基准图");
            else if (result.skipped) message.warning(`已下载 ${result.exported} 张基准图，${result.skipped} 项缺少可用图片`);
            else message.success(`已下载 ${result.exported} 张项目基准图`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "项目资产打包失败");
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="min-w-0" data-drama-assets-library>
            <div className="flex min-w-0 flex-col gap-2 border-b border-border pb-3 xl:flex-row xl:items-center" data-drama-assets-toolbar>
                <nav className="hide-scrollbar flex min-w-0 shrink-0 gap-1 overflow-x-auto" aria-label="项目资产分类">
                    {assetKinds.map((kind) => {
                        const itemDefinition = DRAMA_ASSET_DEFINITIONS[kind];
                        const Icon = assetIcons[kind];
                        const active = activeKind === kind;
                        return (
                            <button
                                key={kind}
                                type="button"
                                className={`flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition ${active ? "bg-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                                style={active ? { color: "var(--background)" } : undefined}
                                onClick={() => {
                                    setActiveKind(kind);
                                    setQuery("");
                                    setFilter("all");
                                }}
                                aria-current={active ? "page" : undefined}
                            >
                                <Icon className="size-3.5" style={active ? { color: "var(--background)" } : undefined} aria-hidden />
                                <span style={active ? { color: "var(--background)" } : undefined}>{itemDefinition.title}</span>
                                <span className="text-[11px] tabular-nums opacity-65" style={active ? { color: "var(--background)" } : undefined}>
                                    {project[kind].length}
                                </span>
                            </button>
                        );
                    })}
                </nav>

                <div className="flex min-w-0 flex-1 items-center gap-2 xl:justify-end">
                    <Input
                        allowClear
                        className="min-w-0 flex-1 xl:!w-56 xl:!flex-none"
                        prefix={<Search className="size-3.5 text-muted-foreground" aria-hidden />}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={`搜索${definition.title}`}
                        aria-label={`搜索${definition.title}`}
                    />
                    <div className="w-[116px] shrink-0">
                        <Select className="w-full" value={filter} options={filterOptions} onChange={setFilter} aria-label="筛选资产状态" />
                    </div>
                    <Dropdown
                        trigger={["click"]}
                        menu={{
                            selectable: true,
                            selectedKeys: [sort],
                            items: (Object.keys(sortLabels) as DramaAssetSort[]).map((value) => ({ key: value, label: sortLabels[value] })),
                            onClick: ({ key }) => setSort(key as DramaAssetSort),
                        }}
                    >
                        <Tooltip title={`排序：${sortLabels[sort]}`}>
                            <Button className="!size-8 !min-w-8" icon={<ArrowDownUp className="size-3.5" />} aria-label={`排序：${sortLabels[sort]}`} />
                        </Tooltip>
                    </Dropdown>
                    <Tooltip title="下载项目基准图">
                        <Button
                            className="!size-8 !min-w-8"
                            loading={exporting}
                            disabled={!project.characters.length && !project.scenes.length && !project.props.length && !project.clues.length}
                            icon={<Download className="size-3.5" />}
                            onClick={() => void exportAssets()}
                            aria-label="下载项目基准图"
                        />
                    </Tooltip>
                    <Button type="primary" className="!h-8 !shrink-0 !px-2.5" icon={<Plus className="size-3.5" />} onClick={() => setEditor({ kind: activeKind })} aria-label={`新建${definition.title}`}>
                        <span className="hidden sm:inline">新建{definition.title}</span>
                    </Button>
                </div>
            </div>

            {visibleRows.length ? (
                <div className="mt-3 grid min-w-0 grid-cols-2 gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]" data-drama-asset-grid>
                    {visibleRows.map((row) => (
                        <DramaAssetCard
                            key={row.asset.id}
                            kind={activeKind}
                            row={row}
                            onEdit={() => setEditor({ kind: activeKind, assetId: row.asset.id })}
                            onDelete={() => {
                                removeAsset(project.id, activeKind, row.asset.id);
                                message.success(`${definition.title}已删除`);
                            }}
                        />
                    ))}
                </div>
            ) : (
                <div className="mt-3 flex min-h-20 min-w-0 items-center justify-between gap-3 rounded-md border border-dashed border-border bg-muted/20 px-3 py-3 sm:px-4" data-drama-assets-empty>
                    <div className="min-w-0">
                        <div className="text-sm font-medium">{hasActiveFilter ? `没有符合条件的${definition.title}` : `还没有${definition.title}`}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">{hasActiveFilter ? "清除筛选可查看全部资产" : `创建后可在所有剧集和镜头中复用`}</div>
                    </div>
                    {hasActiveFilter ? (
                        <Button className="!h-8 !shrink-0" icon={<RotateCcw className="size-3.5" />} onClick={resetFilters}>
                            清除筛选
                        </Button>
                    ) : null}
                </div>
            )}

            {project.sourceAssets?.length ? <DramaSourceAssetStrip project={project} /> : null}

            <DramaAssetEditorDrawer project={project} kind={editor?.kind || activeKind} assetId={editor?.assetId} open={Boolean(editor)} onClose={() => setEditor(undefined)} />
        </div>
    );
}

function DramaAssetCard({ kind, row, onEdit, onDelete }: { kind: DramaAssetKind; row: DramaAssetLibraryRow; onEdit: () => void; onDelete: () => void }) {
    const { asset, incomplete, referenceCount, usageCount } = row;
    const definition = DRAMA_ASSET_DEFINITIONS[kind];
    const references = dramaAssetReferences(asset);
    const primary = references.find((reference) => reference.id === asset.primaryReferenceId) || references[0];

    return (
        <article className="group relative min-w-0 overflow-hidden rounded-md border border-border bg-card transition hover:border-foreground/25 hover:shadow-[0_6px_18px_rgba(15,23,42,.07)]">
            <button type="button" className="block w-full text-left" onClick={onEdit} aria-label={`编辑${definition.title}：${asset.name}`}>
                <div className="grid aspect-[16/10] w-full place-items-center overflow-hidden bg-muted/55">
                    {primary?.url ? (
                        <Image src={imagePreviewUrl(primary.url, 480)} alt={`${asset.name}基准图`} rootClassName="!block !size-full" className="!size-full !object-cover transition duration-300 group-hover:scale-[1.02]" preview={false} />
                    ) : (
                        <div className="grid gap-1.5 text-center text-muted-foreground">
                            <ImagePlus className="mx-auto size-5" aria-hidden />
                            <span className="text-[11px]">待补基准图</span>
                        </div>
                    )}
                </div>
                <div className="min-w-0 px-2.5 py-2">
                    <div className="flex min-w-0 items-center gap-2 pr-7">
                        <h3 className="min-w-0 flex-1 truncate text-sm font-semibold" title={asset.name}>
                            {asset.name}
                        </h3>
                        {!primary ? <span className="shrink-0 text-[10px] font-medium text-amber-600 dark:text-amber-300">缺基准</span> : null}
                    </div>
                    <p className="mt-1 truncate text-xs leading-4 text-muted-foreground" title={asset.description || undefined}>
                        {asset.description || `未填写${definition.label}用途`}
                    </p>
                    <div className="mt-2 flex min-w-0 items-center gap-3 text-[11px] text-muted-foreground">
                        <Tooltip title={`${referenceCount} 张参考图`}>
                            <span className="inline-flex items-center gap-1" aria-label={`${referenceCount} 张参考图`}>
                                <Images className="size-3" aria-hidden />
                                <span className="tabular-nums">{referenceCount}</span>
                            </span>
                        </Tooltip>
                        <Tooltip title={`${usageCount} 个镜头引用`}>
                            <span className={`inline-flex items-center gap-1 ${usageCount ? "text-foreground/75" : ""}`} aria-label={`${usageCount} 个镜头引用`}>
                                <Video className="size-3" aria-hidden />
                                <span className="tabular-nums">{usageCount}</span>
                            </span>
                        </Tooltip>
                        {incomplete ? <span className="ml-auto shrink-0 text-amber-600 dark:text-amber-300">设定待补</span> : usageCount === 0 ? <span className="ml-auto shrink-0">未引用</span> : null}
                    </div>
                </div>
            </button>
            <Popconfirm title={`删除${definition.title}“${asset.name}”？`} description="关联镜头中的资产引用会同步移除。" okText="删除" cancelText="取消" onConfirm={onDelete}>
                <Tooltip title={`删除${definition.title}`}>
                    <Button
                        type="text"
                        shape="circle"
                        className="!absolute !right-1.5 !top-1.5 !size-7 !min-w-7 !bg-background/90 !text-muted-foreground shadow-sm backdrop-blur-sm hover:!bg-rose-50 hover:!text-rose-600 dark:hover:!bg-rose-950/70 dark:hover:!text-rose-300"
                        icon={<Trash2 className="size-3.5" />}
                        aria-label={`删除${definition.title}：${asset.name}`}
                    />
                </Tooltip>
            </Popconfirm>
        </article>
    );
}

function DramaSourceAssetStrip({ project }: { project: DramaProject }) {
    const [expanded, setExpanded] = useState(false);
    return (
        <section className="mt-4 overflow-hidden rounded-md border border-border bg-card/60" data-drama-source-assets>
            <button type="button" className="flex h-10 w-full items-center gap-2 px-3 text-left text-sm transition hover:bg-muted/60" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded}>
                {expanded ? <ChevronDown className="size-4 text-muted-foreground" aria-hidden /> : <ChevronRight className="size-4 text-muted-foreground" aria-hidden />}
                <FileText className="size-3.5 text-muted-foreground" aria-hidden />
                <span className="font-medium">来源素材</span>
                <span className="text-xs tabular-nums text-muted-foreground">{project.sourceAssets?.length || 0}</span>
                <span className="ml-auto text-xs text-muted-foreground">{expanded ? "收起" : "展开查看"}</span>
            </button>
            {expanded ? (
                <div className="grid grid-cols-2 gap-2 border-t border-border p-2 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
                    {project.sourceAssets?.map((asset) => {
                        const url = asset.serverUrl || asset.remoteUrl || "";
                        return (
                            <article key={asset.id} className="flex min-w-0 items-center gap-2 overflow-hidden rounded-md border border-border bg-background p-1.5">
                                <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded bg-muted/55">
                                    {url && asset.type !== "text" ? <AgentMediaPreview type={asset.type} url={url} title={asset.title || "项目来源素材"} className="size-full" /> : <FileText className="size-4 text-muted-foreground" />}
                                </div>
                                <div className="min-w-0">
                                    <div className="truncate text-xs font-medium" title={asset.title}>
                                        {asset.title || "未命名素材"}
                                    </div>
                                    <div className="mt-0.5 text-[10px] uppercase text-muted-foreground">{asset.type}</div>
                                </div>
                            </article>
                        );
                    })}
                </div>
            ) : null}
        </section>
    );
}
