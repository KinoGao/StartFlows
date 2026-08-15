"use client";

import { Plus } from "lucide-react";
import Link from "next/link";

import { usePublicSessionStore } from "@/stores/use-public-session-store";

export function GalleryPublishLink({ className, label = "发布作品" }: { className: string; label?: string }) {
    const ready = usePublicSessionStore((state) => state.ready);
    const user = usePublicSessionStore((state) => state.payload?.user);

    if (!ready || !user) return null;

    return (
        <Link href="/works" className={className}>
            <Plus className="size-4" />
            {label}
        </Link>
    );
}
