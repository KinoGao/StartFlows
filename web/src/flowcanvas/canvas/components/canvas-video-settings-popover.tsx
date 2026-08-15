"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Settings2 } from "lucide-react";
import { Button } from "antd";

import { VideoSettingsPanel, videoResolutionLabel, videoSecondsLabel, videoSizeLabel } from "@/flowcanvas/components/video-settings-panel";
import { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";
import type { AiConfig } from "@/flowcanvas/stores/use-config-store";
import { useVideoModelCapability } from "@/flowcanvas/hooks/use-video-model-capability";
import type { VideoGenerationMode } from "@/flowcanvas/services/api/model-capabilities";

type CanvasVideoSettingsPopoverProps = {
    config: AiConfig;
    generationMode?: VideoGenerationMode;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    buttonClassName?: string;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";

};

export function CanvasVideoSettingsPopover({ config, onConfigChange, open: controlledOpen, onOpenChange, buttonClassName, placement = "topLeft", generationMode }: CanvasVideoSettingsPopoverProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [internalOpen, setInternalOpen] = useState(false);
    const open = controlledOpen ?? internalOpen;
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const { capability } = useVideoModelCapability(config.model || config.videoModel);
    const summary = [
        videoSizeLabel(config.size),
        videoResolutionLabel(config.vquality),
        videoSecondsLabel(config.videoSeconds),
        capability?.counts && capability.counts.length > 1 ? `${config.count || "1"}个` : null,
        capability?.generateAudio ? (config.videoGenerateAudio === "false" ? "静音" : "有声") : null,
    ].filter(Boolean).join(" · ");
    const setOpen = (next: boolean) => {
        if (controlledOpen === undefined) setInternalOpen(next);
        onOpenChange?.(next);
    };

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            setOpen(false);
        };

        syncPosition();
        window.addEventListener("resize", syncPosition);
        window.addEventListener("scroll", syncPosition, true);
        window.addEventListener("pointerdown", closeOnOutsidePointer, true);
        return () => {
            window.removeEventListener("resize", syncPosition);
            window.removeEventListener("scroll", syncPosition, true);
            window.removeEventListener("pointerdown", closeOnOutsidePointer, true);
        };
    }, [open]);

    const panel = open && buttonRect ? <VideoSettingsPortal buttonRect={buttonRect} panelRef={panelRef} placement={placement} theme={theme} config={config} generationMode={generationMode} onConfigChange={onConfigChange} /> : null;

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button
                    size="small"
                    type="text"
                    className={buttonClassName || "!h-8 !max-w-[170px] !justify-start !rounded-full !px-2.5"}
                    style={{ background: theme.node.fill, color: theme.node.text }}
                    icon={<Settings2 className="size-3.5" />}
                    onClick={() => setOpen(!open)}
                >
                    <span className="flex min-w-0 items-center gap-1 truncate"><span className="truncate">{summary}</span><ChevronDown className="size-3 shrink-0 opacity-70" /></span>
                </Button>
            </span>
            {panel}
        </>
    );
}
function VideoSettingsPortal({
    buttonRect,
    panelRef,
    placement,
    theme,
    config,
    generationMode,
    onConfigChange,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasVideoSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    generationMode?: VideoGenerationMode;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
}) {
    const gap = 8;
    const margin = 12;
    const width = Math.max(280, Math.min(620, window.innerWidth - margin * 2));
    const alignRight = placement?.endsWith("Right");
    const alignCenter = placement === "top" || placement === "bottom";
    const left = alignCenter ? buttonRect.left + buttonRect.width / 2 - width / 2 : alignRight ? buttonRect.right - width : buttonRect.left;
    const prefersTop = placement?.startsWith("top");
    const availableAbove = buttonRect.top - gap - margin;
    const availableBelow = window.innerHeight - buttonRect.bottom - gap - margin;
    const comfortableHeight = 340;
    const topPlacement = prefersTop
        ? availableAbove >= comfortableHeight || availableAbove >= availableBelow
        : availableBelow < comfortableHeight && availableAbove > availableBelow;
    const availableHeight = topPlacement ? availableAbove : availableBelow;
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left: Math.max(margin, Math.min(window.innerWidth - width - margin, left)),
        ...(topPlacement ? { bottom: window.innerHeight - buttonRect.top + gap } : { top: buttonRect.bottom + gap }),
        maxHeight: Math.max(160, Math.min(520, availableHeight)),
        background: theme.toolbar.panel,
        borderRadius: 14,
        boxShadow: "0 18px 54px rgba(28, 25, 23, 0.16)",
        padding: 14,
        overflowY: "auto",
        color: theme.node.text,
    } as const;

    return createPortal(
        <div ref={panelRef} className="canvas-image-settings-popover [&::-webkit-scrollbar]:hidden" style={{ ...style, scrollbarWidth: "none" }} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
            <VideoSettingsPanel config={config} generationMode={generationMode} onConfigChange={(key, value) => onConfigChange(key, value)} theme={theme} className="space-y-3" variant="composer" />
        </div>,
        document.body,
    );
}
