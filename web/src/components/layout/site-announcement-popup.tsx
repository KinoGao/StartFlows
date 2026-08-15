"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Button, Modal } from "antd";
import { Megaphone } from "lucide-react";

import { useAnnouncementReadState } from "@/hooks/use-announcement-read-state";
import { useAnnouncements } from "@/hooks/use-announcements";
import type { PublicAnnouncement } from "@/services/api/announcements";
import { useUserStore } from "@/stores/use-user-store";

export function SiteAnnouncementPopup() {
    const pathname = usePathname();
    const user = useUserStore((state) => state.user);
    const { data: announcements = [] } = useAnnouncements({ enabled: pathname === "/" || Boolean(user) });
    const { markRead } = useAnnouncementReadState();
    const [open, setOpen] = useState(false);
    const [activeId, setActiveId] = useState("");
    const active = useMemo(() => announcements.find((item) => item.id === activeId) || null, [activeId, announcements]);

    useEffect(() => {
        if (!announcements.length) return;
        const contexts = [
            { key: "home", enabled: pathname === "/", match: (item: PublicAnnouncement) => item.popupHome },
            { key: "login", enabled: Boolean(user), match: (item: PublicAnnouncement) => item.popupAfterLogin },
        ];
        for (const context of contexts) {
            if (!context.enabled) continue;
            const item = announcements.find((announcement) => context.match(announcement) && !localStorage.getItem(dismissKey(announcement.id, context.key)));
            if (!item) continue;
            setActiveId(item.id);
            setOpen(true);
            return;
        }
    }, [announcements, pathname, user]);

    const close = () => {
        if (active) {
            if (pathname === "/" && active.popupHome) localStorage.setItem(dismissKey(active.id, "home"), "1");
            if (user && active.popupAfterLogin) localStorage.setItem(dismissKey(active.id, "login"), "1");
            markRead(active.id);
        }
        setOpen(false);
    };

    return (
        <Modal open={open} onCancel={close} footer={null} centered width={560} destroyOnHidden>
            {active ? (
                <div className="px-1 py-1">
                    <div className="mb-4 flex items-center gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200/80 dark:bg-cyan-950/40 dark:text-cyan-200 dark:ring-cyan-900/70">
                            <Megaphone className="size-5" />
                        </span>
                        <div className="min-w-0">
                            <h2 className="truncate text-lg font-semibold text-stone-950 dark:text-stone-100">{active.title}</h2>
                            <div className="mt-1 text-xs text-stone-500 dark:text-stone-400">{new Date(active.createdAt).toLocaleString("zh-CN")}</div>
                        </div>
                    </div>
                    <div className="max-h-[50dvh] overflow-y-auto whitespace-pre-wrap rounded-lg border border-stone-200 bg-stone-50/70 p-4 text-sm leading-7 text-stone-700 dark:border-stone-800 dark:bg-stone-900/50 dark:text-stone-200">
                        {active.content}
                    </div>
                    <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
                        <Button onClick={close}>我知道了</Button>
                        <Button type="primary" href="/announcements" onClick={close}>
                            查看全部公告
                        </Button>
                    </div>
                </div>
            ) : null}
        </Modal>
    );
}

function dismissKey(id: string, context: string) {
    return `vozeb-pro:announcement-dismissed:${context}:${id}`;
}
