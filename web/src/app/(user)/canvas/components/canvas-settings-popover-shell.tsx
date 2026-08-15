"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "antd";
import { Settings2 } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";

export type CanvasSettingsPopoverPlacement = "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";
type CanvasTheme = (typeof canvasThemes)[keyof typeof canvasThemes];

type CanvasSettingsPopoverShellProps = {
    label: ReactNode;
    children: (theme: CanvasTheme) => ReactNode;
    buttonClassName?: string;
    defaultButtonClassName: string;
    icon?: ReactNode;
    placement?: CanvasSettingsPopoverPlacement;
    onOpenChange?: (open: boolean) => void;
    buttonAriaLabel?: string;
};

export function CanvasSettingsPopoverShell({ label, children, buttonClassName, defaultButtonClassName, icon, placement = "topLeft", onOpenChange, buttonAriaLabel }: CanvasSettingsPopoverShellProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const buttonRef = useRef<HTMLSpanElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [buttonRect, setButtonRect] = useState<DOMRect | null>(null);
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
            if (target instanceof Element && target.closest(".ant-select-dropdown")) return;
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

    return (
        <>
            <span ref={buttonRef} className="inline-flex min-w-0">
                <Button
                    size="small"
                    type="text"
                    className={buttonClassName || defaultButtonClassName}
                    style={{ background: theme.node.fill, color: theme.node.text }}
                    icon={icon || <Settings2 className="size-3.5" />}
                    aria-label={buttonAriaLabel}
                    aria-expanded={open}
                    onClick={() => updateOpen(!open)}
                >
                    <span className="truncate">{label}</span>
                </Button>
            </span>
            {open && buttonRect
                ? createPortal(
                      <SettingsPanel buttonRect={buttonRect} panelRef={panelRef} placement={placement} theme={theme}>
                          {children(theme)}
                      </SettingsPanel>,
                      document.body,
                  )
                : null}
        </>
    );
}

function SettingsPanel({ buttonRect, panelRef, placement, theme, children }: { buttonRect: DOMRect; panelRef: React.RefObject<HTMLDivElement | null>; placement: CanvasSettingsPopoverPlacement; theme: CanvasTheme; children: ReactNode }) {
    const gap = 8;
    const margin = 12;
    const width = Math.min(340, window.innerWidth - margin * 2);
    const alignRight = placement.endsWith("Right");
    const alignCenter = placement === "top" || placement === "bottom";
    const left = alignCenter ? buttonRect.left + buttonRect.width / 2 - width / 2 : alignRight ? buttonRect.right - width : buttonRect.left;
    const topSpace = buttonRect.top - gap - margin;
    const bottomSpace = window.innerHeight - buttonRect.bottom - gap - margin;
    const prefersTop = placement.startsWith("top");
    const topPlacement = prefersTop ? topSpace >= 240 || topSpace >= bottomSpace : !(bottomSpace >= 240 || bottomSpace >= topSpace);
    const maxHeight = Math.max(180, topPlacement ? topSpace : bottomSpace);
    const style = {
        position: "fixed",
        zIndex: 1200,
        width,
        left: Math.max(margin, Math.min(window.innerWidth - width - margin, left)),
        ...(topPlacement ? { bottom: window.innerHeight - buttonRect.top + gap } : { top: buttonRect.bottom + gap }),
        maxHeight,
        background: theme.toolbar.panel,
        borderRadius: 16,
        boxShadow: "0 18px 54px rgba(28, 25, 23, 0.16)",
        padding: 16,
        overflowY: "auto",
        color: theme.node.text,
    } as const;

    return (
        <div ref={panelRef} className="canvas-image-settings-popover" style={style} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
            {children}
        </div>
    );
}
