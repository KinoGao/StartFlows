"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { isGenerationCapacityError } from "@/services/api/generation-task-request-error";

const RETRY_DELAY_MS = 5000;

export function useGenerationCapacityRetry() {
    const timers = useRef(new Map<string, number>());
    const [waitingKeys, setWaitingKeys] = useState<Set<string>>(() => new Set());

    useEffect(
        () => () => {
            timers.current.forEach((timer) => window.clearTimeout(timer));
            timers.current.clear();
        },
        [],
    );

    const schedule = useCallback((key: string, error: unknown) => {
        if (!isGenerationCapacityError(error)) return false;
        if (timers.current.has(key)) return true;
        setWaitingKeys((current) => new Set(current).add(key));
        const timer = window.setTimeout(() => {
            timers.current.delete(key);
            setWaitingKeys((current) => {
                const next = new Set(current);
                next.delete(key);
                return next;
            });
        }, RETRY_DELAY_MS);
        timers.current.set(key, timer);
        return true;
    }, []);

    const isWaiting = useCallback((key: string) => waitingKeys.has(key), [waitingKeys]);
    return { isWaiting, schedule };
}
