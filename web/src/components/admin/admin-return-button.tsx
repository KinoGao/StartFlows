"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function AdminReturnButton() {
    const router = useRouter();

    useEffect(() => {
        router.prefetch("/create");
    }, [router]);

    return (
        <button
            type="button"
            className="admin-dashboard-return-button inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 transition hover:border-stone-300 hover:text-stone-950 dark:border-stone-800 dark:bg-stone-950 dark:text-stone-300 dark:hover:border-stone-700 dark:hover:text-white"
            aria-label="返回 Agent 创作"
            onMouseEnter={() => router.prefetch("/create")}
            onFocus={() => router.prefetch("/create")}
            onClick={() => router.push("/create")}
        >
            <ArrowLeft className="size-4" />
            <span className="admin-dashboard-return-label">返回 Agent 创作</span>
        </button>
    );
}
