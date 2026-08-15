"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

export function SiteLogo({ logoUrl, className }: { logoUrl: string; className?: string }) {
    const customLogoUrl = logoUrl.trim() && logoUrl !== "/logo.svg" ? logoUrl.trim() : "";
    const [failedLogoUrl, setFailedLogoUrl] = useState("");

    if (customLogoUrl && failedLogoUrl !== customLogoUrl) {
        return <img src={customLogoUrl} alt="" className={cn("shrink-0 object-contain", className)} referrerPolicy="no-referrer" onError={() => setFailedLogoUrl(customLogoUrl)} />;
    }

    return (
        <span
            aria-hidden="true"
            className={cn("shrink-0 bg-stone-950 dark:bg-white", className)}
            style={{
                mask: "url(/logo.svg) center / contain no-repeat",
                WebkitMask: "url(/logo.svg) center / contain no-repeat",
            }}
        />
    );
}
