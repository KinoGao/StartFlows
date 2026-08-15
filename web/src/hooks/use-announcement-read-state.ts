"use client";

import { useCallback, useEffect, useState } from "react";

import { mergeAnnouncementReadIds, parseAnnouncementReadIds } from "@/lib/announcement-notifications";

const STORAGE_KEY = "vozeb-pro:announcement-read:v1";
const CHANGE_EVENT = "vozeb-pro:announcement-read-change";

export function useAnnouncementReadState() {
    const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
    const [hydrated, setHydrated] = useState(false);

    useEffect(() => {
        const sync = () => {
            setReadIds(parseAnnouncementReadIds(localStorage.getItem(STORAGE_KEY)));
            setHydrated(true);
        };
        const syncStorage = (event: StorageEvent) => {
            if (event.key === STORAGE_KEY) sync();
        };
        sync();
        window.addEventListener(CHANGE_EVENT, sync);
        window.addEventListener("storage", syncStorage);
        return () => {
            window.removeEventListener(CHANGE_EVENT, sync);
            window.removeEventListener("storage", syncStorage);
        };
    }, []);

    const markRead = useCallback((...ids: string[]) => {
        const current = parseAnnouncementReadIds(localStorage.getItem(STORAGE_KEY));
        const next = mergeAnnouncementReadIds(current, ids);
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
        setReadIds(next);
        window.dispatchEvent(new Event(CHANGE_EVENT));
    }, []);

    return { readIds, hydrated, markRead };
}
