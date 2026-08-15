"use client";

import dynamic from "next/dynamic";
import { useState, type SyntheticEvent } from "react";
import { Maximize2 } from "lucide-react";
import { Modal } from "antd";

import { canvasThemes } from "@/lib/canvas-theme";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { useThemeStore } from "@/stores/use-theme-store";

const CanvasPanoramaSurface = dynamic(() => import("./canvas-panorama-surface").then((module) => module.CanvasPanoramaSurface), {
    ssr: false,
    loading: () => <div className="grid h-full w-full place-items-center text-xs text-white/75">正在准备全景查看器...</div>,
});

const stopCanvasInteraction = (event: SyntheticEvent) => event.stopPropagation();

export function CanvasPanoramaViewer({ src, alt }: { src: string; alt: string }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [open, setOpen] = useState(false);
    const previewSrc = imagePreviewUrl(src, 1920);

    if (!src) return null;

    return (
        <>
            <div className="relative h-full w-full overflow-hidden" data-canvas-no-zoom>
                <img src={previewSrc} alt={alt} draggable={false} className="block h-full w-full select-none object-cover" />
                <button
                    type="button"
                    className="absolute bottom-3 right-3 z-10 inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium shadow-lg backdrop-blur transition hover:opacity-90"
                    style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item }}
                    onClick={(event) => {
                        event.stopPropagation();
                        setOpen(true);
                    }}
                    onMouseDown={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    aria-label="沉浸查看全景"
                    title="沉浸查看全景"
                >
                    <Maximize2 className="size-3.5" />
                    沉浸查看
                </button>
            </div>
            <div className="contents" onClick={stopCanvasInteraction} onDoubleClick={stopCanvasInteraction} onMouseDown={stopCanvasInteraction} onPointerDown={stopCanvasInteraction} onWheel={stopCanvasInteraction} onContextMenu={stopCanvasInteraction}>
                <Modal
                    open={open}
                    title="全景查看"
                    centered
                    destroyOnHidden
                    mask={{ closable: false }}
                    footer={null}
                    width="min(1180px, calc(100vw - 24px))"
                    onCancel={() => setOpen(false)}
                    styles={{ body: { padding: 0 }, container: { background: theme.toolbar.panel, color: theme.node.text } }}
                >
                    <div className="h-[72vh] min-h-[320px] overflow-hidden rounded-xl bg-black sm:h-[78vh]">
                        <CanvasPanoramaSurface src={previewSrc} alt={alt} />
                    </div>
                </Modal>
            </div>
        </>
    );
}
