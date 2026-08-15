"use client";

import { useCallback, useLayoutEffect, useRef, useState, type UIEvent } from "react";

const LATEST_MESSAGE_THRESHOLD = 96;

export function isCanvasAgentNearLatest({ scrollHeight, scrollTop, clientHeight }: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">) {
    return scrollHeight - scrollTop - clientHeight <= LATEST_MESSAGE_THRESHOLD;
}

export function useCanvasAgentMessageScroll(active: boolean, contentKey: string, position: "top" | "latest" = "latest") {
    const scrollRef = useRef<HTMLDivElement>(null);
    const followLatestRef = useRef(true);
    const forceLatestRef = useRef(true);
    const [showLatestButton, setShowLatestButton] = useState(false);

    const scrollToLatest = useCallback(() => {
        const container = scrollRef.current;
        if (!container) return;
        followLatestRef.current = true;
        forceLatestRef.current = false;
        setShowLatestButton(false);
        container.scrollTo({ top: container.scrollHeight });
    }, []);

    const requestLatest = useCallback(() => {
        forceLatestRef.current = true;
        followLatestRef.current = true;
    }, []);

    useLayoutEffect(() => {
        const container = scrollRef.current;
        if (!active || !container) return;
        if (position === "top") {
            forceLatestRef.current = false;
            followLatestRef.current = true;
            setShowLatestButton(false);
            container.scrollTo({ top: 0 });
            return;
        }
        if (!forceLatestRef.current && !followLatestRef.current) return;
        scrollToLatest();
    }, [active, contentKey, position, scrollToLatest]);

    const handleScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
        const nearLatest = isCanvasAgentNearLatest(event.currentTarget);
        followLatestRef.current = nearLatest;
        setShowLatestButton(!nearLatest);
    }, []);

    return { scrollRef, showLatestButton, requestLatest, scrollToLatest, handleScroll };
}
