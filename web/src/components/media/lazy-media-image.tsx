"use client";

import { useEffect, useState } from "react";

import { SiteLogo } from "@/components/layout/site-logo";
import { cn } from "@/lib/utils";
import { usePublicSessionStore } from "@/stores/use-public-session-store";

export function LazyMediaImage({
    src,
    alt,
    containerClassName,
    imageClassName,
    errorLabel = "图片不可用",
    placeholderSrc,
    loading = "lazy",
}: {
    src: string;
    alt: string;
    containerClassName?: string;
    imageClassName?: string;
    errorLabel?: string;
    placeholderSrc?: string;
    loading?: "eager" | "lazy";
}) {
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [placeholderReady, setPlaceholderReady] = useState(false);
    const logoUrl = usePublicSessionStore((state) => state.payload?.settings?.site?.logoUrl) || "/logo.svg";
    const hasPlaceholder = Boolean(placeholderSrc && placeholderSrc !== src);

    useEffect(() => setStatus("loading"), [src]);
    useEffect(() => setPlaceholderReady(false), [placeholderSrc]);

    return (
        <span className={cn("relative overflow-hidden bg-muted", hasPlaceholder ? "grid" : "block", status !== "ready" && "min-h-20", containerClassName)}>
            {status === "loading" && !placeholderReady ? (
                <span className="absolute inset-0 grid min-h-20 place-items-center" aria-hidden="true">
                    <SiteLogo logoUrl={logoUrl} className="size-8 opacity-35" />
                </span>
            ) : null}
            {status === "error" && !placeholderReady ? (
                <span className="absolute inset-0 grid min-h-20 place-items-center text-muted-foreground" role="img" aria-label={errorLabel}>
                    <span className="flex flex-col items-center gap-1.5 text-xs">
                        <SiteLogo logoUrl={logoUrl} className="size-7 opacity-45" />
                        {errorLabel}
                    </span>
                </span>
            ) : null}
            {hasPlaceholder ? (
                <img
                    src={placeholderSrc}
                    alt=""
                    aria-hidden="true"
                    loading="eager"
                    decoding="async"
                    className={cn("col-start-1 row-start-1 transition-opacity duration-300", status === "ready" ? "opacity-0" : "opacity-100", imageClassName)}
                    onLoad={() => setPlaceholderReady(true)}
                />
            ) : null}
            <img
                src={src}
                alt={alt}
                loading={loading}
                decoding="async"
                className={cn("transition-[opacity,transform] duration-300", hasPlaceholder && "col-start-1 row-start-1", status === "ready" ? "opacity-100" : "opacity-0", status === "error" && "invisible", imageClassName)}
                onLoad={() => setStatus("ready")}
                onError={() => setStatus("error")}
            />
        </span>
    );
}
