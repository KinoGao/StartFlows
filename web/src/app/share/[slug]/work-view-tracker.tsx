"use client";

import { useEffect, useRef } from "react";

export function WorkViewTracker({ slug }: { slug: string }) {
    const sentRef = useRef(false);

    useEffect(() => {
        if (sentRef.current) return;
        sentRef.current = true;
        void fetch(`/api/public/works/${encodeURIComponent(slug)}/view`, { method: "POST", keepalive: true }).catch(() => undefined);
    }, [slug]);

    return null;
}
