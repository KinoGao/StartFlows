"use client";

import { useCallback, useEffect, useState } from "react";

import type { CreateWorkbenchOverviewPayload } from "@/lib/create-workbench-overview";
import { getCreateWorkbenchOverview } from "@/services/api/create-workbench-overview";

const EMPTY_OVERVIEW: CreateWorkbenchOverviewPayload = { runningTasks: [], recentAssets: [] };

export function useCreateWorkbenchOverview() {
    const [overview, setOverview] = useState<CreateWorkbenchOverviewPayload>(EMPTY_OVERVIEW);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>();
    const [reloadToken, setReloadToken] = useState(0);

    const reload = useCallback(() => setReloadToken((value) => value + 1), []);

    useEffect(() => {
        let active = true;
        setLoading(true);
        setError(undefined);
        void getCreateWorkbenchOverview()
            .then((payload) => {
                if (active) setOverview(payload);
            })
            .catch((error) => {
                if (active) setError(error instanceof Error ? error.message : "工作台概览加载失败");
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [reloadToken]);

    return {
        ...overview,
        loading,
        error,
        reload,
    };
}
