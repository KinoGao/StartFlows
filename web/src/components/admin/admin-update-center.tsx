import { ArrowRight, CheckCircle2, ExternalLink, ShieldCheck, UsersRound } from "lucide-react";

import { Panel, PanelHeader } from "@/components/admin/admin-panel";
import { GitHubLink } from "@/components/layout/github-link";
import { VersionReleaseModal } from "@/components/layout/version-release-modal";
import { VOZEB_QQ_GROUP_URL } from "@/constant/community";
import { APP_VERSION } from "@/constant/env";
import { resolveSiteTitle } from "@/lib/site-brand";
import { usePublicSessionStore } from "@/stores/use-public-session-store";

export function UpdateCenterPanel() {
    const siteTitle = usePublicSessionStore((state) => resolveSiteTitle(state.payload?.settings?.site?.title));
    const releaseLinks = [
        { label: "Release", href: "https://github.com/csyqlz/VOZEB-PRO/releases", description: "查看正式版本包和升级说明" },
        { label: "Issues", href: "https://github.com/csyqlz/VOZEB-PRO/issues", description: "提交问题、部署异常和功能建议" },
        { label: "Docs", href: "https://github.com/csyqlz/VOZEB-PRO", description: "查看开源仓库与部署入口" },
    ];
    const upgradeChecks = ["备份 PostgreSQL 数据库", "确认 .env / Docker 环境变量", "阅读 CHANGELOG 破坏性变更", "保留当前版本回滚方式"];
    return (
        <Panel>
            <PanelHeader title="更新中心" description="版本检查、升级准备、更新日志和 GitHub 仓库入口集中放在这里。" actions={<GitHubLink className="rounded-xl" />} />
            <div className="space-y-3 p-3 sm:space-y-5 sm:p-5">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
                    <div className="overflow-hidden rounded-3xl border border-stone-200/80 bg-stone-950 text-white shadow-sm shadow-stone-950/10 dark:border-stone-800 dark:bg-white dark:text-stone-950">
                        <div className="grid gap-3 p-4 sm:gap-6 sm:p-6 lg:grid-cols-[minmax(0,1fr)_220px]">
                            <div className="min-w-0">
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/55 dark:text-stone-500">{siteTitle} Update</div>
                                <h3 className="mt-2 text-2xl font-semibold tracking-normal sm:mt-4 sm:text-3xl">可升级，也可回滚。</h3>
                                <div className="mt-2 max-w-2xl text-xs leading-5 text-white/68 sm:mt-3 sm:text-sm sm:leading-6 dark:text-stone-600">
                                    商业化部署升级前先确认数据库备份、环境变量和变更日志；服务器安装用户可以在这里集中完成版本检查与资料跳转。
                                </div>
                                <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-5 sm:flex sm:flex-wrap">
                                    <VersionReleaseModal className="admin-update-primary-button inline-flex h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold transition sm:h-10 sm:rounded-xl sm:px-4 sm:text-sm" label="查看更新日志" />
                                    <a
                                        href="https://github.com/csyqlz/VOZEB-PRO/releases"
                                        target="_blank"
                                        rel="noreferrer"
                                        className="admin-update-secondary-link inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition sm:h-10 sm:gap-2 sm:rounded-xl sm:px-4 sm:text-sm"
                                    >
                                        <ExternalLink className="size-4" />
                                        打开 Release
                                    </a>
                                    <a
                                        href={VOZEB_QQ_GROUP_URL}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="admin-update-secondary-link col-span-2 inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition sm:col-auto sm:h-10 sm:gap-2 sm:rounded-xl sm:px-4 sm:text-sm"
                                    >
                                        <UsersRound className="size-4" />
                                        加入 QQ 群
                                    </a>
                                </div>
                            </div>
                            <div className="rounded-xl bg-white/10 p-3 ring-1 ring-white/12 sm:rounded-2xl sm:p-4 dark:bg-stone-950/5 dark:ring-stone-200">
                                <div className="text-xs text-white/55 dark:text-stone-500">当前版本</div>
                                <div className="mt-1 text-2xl font-semibold tracking-normal sm:mt-2 sm:text-3xl">{APP_VERSION}</div>
                                <div className="mt-2 line-clamp-2 rounded-lg bg-white/10 px-2.5 py-1.5 text-[11px] leading-[18px] text-white/65 sm:mt-4 sm:line-clamp-none sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs sm:leading-5 dark:bg-white dark:text-stone-500">
                                    点击“查看更新日志”会读取远端 VERSION 与 CHANGELOG，并在弹窗中展示差异。
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="rounded-xl border border-stone-200/80 bg-stone-50/70 p-3 sm:rounded-3xl sm:p-5 dark:border-stone-800 dark:bg-stone-900/45">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-semibold text-stone-950 dark:text-stone-100">升级准备</div>
                                <div className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">生产环境升级前建议逐项确认。</div>
                            </div>
                            <ShieldCheck className="size-5 text-stone-500 dark:text-stone-400" />
                        </div>
                        <div className="mt-3 divide-y divide-stone-200 dark:divide-stone-800 sm:mt-4 sm:space-y-2 sm:divide-y-0">
                            {upgradeChecks.map((item) => (
                                <div key={item} className="flex items-center gap-2 py-2 text-xs text-stone-700 sm:rounded-2xl sm:bg-white sm:px-3 sm:text-sm sm:ring-1 sm:ring-stone-200 dark:text-stone-200 sm:dark:bg-stone-950 sm:dark:ring-stone-800">
                                    <CheckCircle2 className="size-3.5 text-stone-500 sm:size-4 dark:text-stone-400" />
                                    {item}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                    {releaseLinks.map((item) => (
                        <a
                            key={item.label}
                            href={item.href}
                            target="_blank"
                            rel="noreferrer"
                            className="group rounded-xl border border-stone-200/80 bg-white p-3 transition hover:-translate-y-0.5 hover:shadow-sm hover:shadow-stone-200/70 sm:rounded-3xl sm:p-5 dark:border-stone-800 dark:bg-stone-950 dark:hover:shadow-black/20"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-base font-semibold text-stone-950 dark:text-stone-100">{item.label}</div>
                                <span className="flex size-8 items-center justify-center rounded-lg bg-stone-50 text-stone-500 ring-1 ring-stone-200 transition group-hover:bg-stone-950 group-hover:text-white sm:size-9 sm:rounded-2xl dark:bg-stone-900 dark:text-stone-300 dark:ring-stone-800 dark:group-hover:bg-white dark:group-hover:text-stone-950">
                                    <ArrowRight className="size-4" />
                                </span>
                            </div>
                            <div className="mt-1 text-xs leading-5 text-stone-500 sm:mt-3 sm:text-sm sm:leading-6 dark:text-stone-400">{item.description}</div>
                        </a>
                    ))}
                </div>
            </div>
        </Panel>
    );
}
