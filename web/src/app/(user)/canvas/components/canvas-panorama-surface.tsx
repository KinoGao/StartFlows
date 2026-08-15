"use client";

import { useEffect, useRef, useState } from "react";
import { SYSTEM, Viewer } from "@photo-sphere-viewer/core";
import "@photo-sphere-viewer/core/index.css";

export function CanvasPanoramaSurface({ src, alt }: { src: string; alt: string }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let viewer: Viewer | null = null;
        const handleReady = () => setStatus("ready");
        const handleError = () => setStatus("error");

        try {
            SYSTEM.load();
            viewer = new Viewer({
                container,
                panorama: src,
                navbar: false,
                mousewheel: true,
                mousemove: true,
                touchmoveTwoFingers: false,
                moveInertia: false,
                defaultZoomLvl: 50,
                minFov: 25,
                maxFov: 110,
            });
            viewer.addEventListener("ready", handleReady);
            viewer.addEventListener("panorama-error", handleError);
        } catch {
            setStatus("error");
        }

        return () => {
            viewer?.removeEventListener("ready", handleReady);
            viewer?.removeEventListener("panorama-error", handleError);
            viewer?.destroy();
        };
    }, [src]);

    return (
        <div className="relative h-full w-full overflow-hidden" data-canvas-no-zoom>
            {status === "error" ? <img src={src} alt={alt} draggable={false} className="absolute inset-0 h-full w-full object-contain" /> : null}
            <div ref={containerRef} className="absolute inset-0 transition-opacity duration-200" style={{ opacity: status === "ready" ? 1 : 0 }} />
            {status === "loading" ? <div className="absolute inset-0 grid place-items-center bg-black/20 text-xs text-white/80">正在加载全景图...</div> : null}
            {status === "error" ? <div className="absolute inset-x-0 bottom-4 text-center text-xs text-white/80">全景查看器加载失败，已显示原图</div> : null}
        </div>
    );
}
