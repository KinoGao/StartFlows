"use client";

import type { ReactNode } from "react";
import { Mail, RefreshCw, Send } from "lucide-react";

import { SectionTitle } from "@/components/admin/admin-settings-controls";
import { SiteLogo } from "@/components/layout/site-logo";
import type { AuthSettings, SiteSocialKey } from "@/lib/auth/store";

export const siteSocialItems: Array<{ key: SiteSocialKey; label: string; placeholder: string; icon: ReactNode }> = [
    { key: "email", label: "邮箱联系", placeholder: "name@example.com", icon: <Mail className="size-4" /> },
    { key: "telegram", label: "Telegram", placeholder: "https://t.me/username 或 @username", icon: <Send className="size-4" /> },
    { key: "x", label: "X", placeholder: "https://x.com/username 或 @username", icon: <span className="text-xs font-bold">X</span> },
    { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/username 或 @username", icon: <span className="text-[11px] font-bold">IG</span> },
];

export function SiteLogoPreview({ logoUrl }: { logoUrl: string }) {
    return (
        <span className="grid size-12 place-items-center rounded-md bg-stone-100 p-1 text-stone-950 dark:bg-white/10 dark:text-white">
            <SiteLogo logoUrl={logoUrl || "/logo.svg"} className="size-10" />
        </span>
    );
}

export function SiteSettingStatus({ site }: { site: AuthSettings["site"] }) {
    const enabledSocialCount = siteSocialItems.filter((item) => site.socials[item.key]?.enabled && site.socials[item.key]?.url.trim()).length;
    const enabledFriendLinkCount = (site.friendLinks || []).filter((link) => link.enabled && link.label.trim() && link.url.trim()).length;
    const seoReady = Boolean((site.seoTitle || site.title).trim() && site.seoDescription.trim());

    return (
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm shadow-stone-200/40 dark:border-stone-800 dark:bg-stone-950 dark:shadow-black/20">
            <SectionTitle icon={<RefreshCw className="size-4" />} title="同步状态" />
            <div className="mt-4 grid grid-cols-2 gap-2">
                <SiteStatusChip label="Logo" value={site.logoUrl.trim() ? "已设置" : "默认"} active={Boolean(site.logoUrl.trim())} />
                <SiteStatusChip label="浏览器图标" value={site.iconUrl.trim() ? "已设置" : "默认"} active={Boolean(site.iconUrl.trim())} />
                <SiteStatusChip label="SEO" value={seoReady ? "完整" : "待补充"} active={seoReady} />
                <SiteStatusChip label="社交媒体" value={`${enabledSocialCount} 项`} active={enabledSocialCount > 0} />
                <SiteStatusChip label="友情链接" value={`${enabledFriendLinkCount} 条`} active={enabledFriendLinkCount > 0} />
            </div>
        </div>
    );
}

function SiteStatusChip({ label, value, active }: { label: string; value: string; active: boolean }) {
    return (
        <div className="min-w-0 rounded-lg border border-stone-200 bg-stone-50/80 p-3 dark:border-stone-800 dark:bg-stone-900/50">
            <div className="text-xs text-stone-500 dark:text-stone-400">{label}</div>
            <div className={`mt-1 truncate text-sm font-semibold ${active ? "text-stone-950 dark:text-stone-100" : "text-stone-500 dark:text-stone-400"}`}>{value}</div>
        </div>
    );
}
