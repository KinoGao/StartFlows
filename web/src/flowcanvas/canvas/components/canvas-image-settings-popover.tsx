"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Settings2 } from "lucide-react";
import { Button } from "antd";

import { ImageSettingsPanel, imageQualityLabel, imageResolutionLabel, imageSizeLabel } from "@/flowcanvas/components/image-settings-panel";
import { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";
import type { AiConfig } from "@/flowcanvas/stores/use-config-store";

type CanvasImageSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onMissingConfig?: () => void;
    onOpenChange?: (open: boolean) => void;
    buttonClassName?: string;
    getPopupContainer?: (triggerNode: HTMLElement) => HTMLElement;
    placement?: "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
    autoAdjustOverflow?: boolean;
    referenceCount?: number;
    variant?: "default" | "composer";
    summaryMode?: "full" | "dimensions";
    buttonIcon?: ReactNode;
};

export function CanvasImageSettingsPopover({ config, onConfigChange, onOpenChange, buttonClassName, placement = "topLeft", referenceCount = 0, variant = "default", summaryMode = "full", buttonIcon }: CanvasImageSettingsPopoverProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
    const quality = config.quality || "medium";
    const resolution = config.resolution || "2k";
    const count = Math.max(1, Math.min(15, Math.floor(Math.abs(Number(config.count)) || 1)));
    const activeSize = config.size || "auto";
    const updateOpen = (nextOpen: boolean) => {
        setOpen(nextOpen);
        onOpenChange?.(nextOpen);
    };

    useEffect(() => {
        if (!open) return;
        const syncPosition = () => setButtonRect(buttonRef.current?.getBoundingClientRect() || null);
        const closeOnOutsidePointer = (event: PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
            if (document.activeElement instanceof HTMLElement && panelRef.current?.contains(document.activeElement)) document.activeElement.blur();
            setOpen(false);
            onOpenChange?.(false);
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
    }, [onOpenChange, open]);

    const panel = open && buttonRect ? <ImageSettingsPortal buttonRect={buttonRect} panelRef={panelRef} placement={placement} theme={theme} config={config} referenceCount={referenceCount} variant={variant} onConfigChange={onConfigChange} /> : null;

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button
                    size="small"
                    type="text"
                    className={buttonClassName || "!h-8 !max-w-[180px] !justify-start !rounded-full !px-2.5"}
                    style={{ background: theme.node.fill, color: theme.node.text }}
                    icon={buttonIcon || <Settings2 className="size-3.5" />}
                    onClick={() => updateOpen(!open)}
                >
                    <span className="truncate">
                        {summaryMode === "dimensions"
                            ? `${imageSizeLabel(activeSize)} · ${imageResolutionLabel(resolution)}`
                            : `${imageQualityLabel(quality)} · ${imageResolutionLabel(resolution)} · ${imageSizeLabel(activeSize)} · ${count} 张`}
                    </span>
                </Button>
            </span>
            {panel}
        </>
    );
}

function ImageSettingsPortal({
    buttonRect,
    panelRef,
    placement,
    theme,
    config,
    referenceCount,
    variant,
    onConfigChange,
}: {
    buttonRect: DOMRect;
    panelRef: RefObject<HTMLDivElement | null>;
    placement: CanvasImageSettingsPopoverProps["placement"];
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    config: AiConfig;
    referenceCount: number;
    variant: NonNullable<CanvasImageSettingsPopoverProps["variant"]>;
    onConfigChange: (key: keyof AiConfig, value: string) => void;
}) {
    const width = variant === "composer" ? 440 : 376;
    const gap = 8;
    const margin = 12;
    const alignRight = placement?.endsWith("Right");
    const alignCenter = placement === "top" || placement === "bottom";
    const left = alignCenter ? buttonRect.left + buttonRect.width / 2 - width / 2 : alignRight ? buttonRect.right - width : buttonRect.left;
    const topPlacement = placement?.startsWith("top");
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left: Math.max(margin, Math.min(window.innerWidth - width - margin, left)),
        ...(topPlacement ? { bottom: window.innerHeight - buttonRect.top + gap, maxHeight: Math.max(260, buttonRect.top - margin * 2) } : { top: buttonRect.bottom + gap, maxHeight: Math.max(260, window.innerHeight - buttonRect.bottom - margin * 2) }),
        background: variant === "composer" ? theme.ui.materialElevated : theme.toolbar.panel,
        border: variant === "composer" ? `1px solid ${theme.ui.hairline}` : undefined,
        borderRadius: variant === "composer" ? 8 : 18,
        boxShadow: "0 18px 54px rgba(28, 25, 23, 0.16)",
        padding: variant === "composer" ? 14 : 18,
        overflowY: "auto",
        color: theme.node.text,
        backdropFilter: variant === "composer" ? "blur(24px) saturate(1.3)" : undefined,
    } as const;

    return createPortal(
        <div
            ref={panelRef}
            className="canvas-image-settings-popover"
            style={style}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onWheelCapture={(event) => { if (!event.ctrlKey && !event.metaKey) event.stopPropagation(); }}
            onWheel={(event) => { if (!event.ctrlKey && !event.metaKey) event.stopPropagation(); }}
        >
            <ImageSettingsPanel
                config={config}
                onConfigChange={(key, value) => onConfigChange(key, value)}
                theme={theme}
                showTitle={variant !== "composer"}
                className="space-y-4"
                referenceCount={referenceCount}
                variant={variant}
            />
        </div>,
        document.body,
    );
}
