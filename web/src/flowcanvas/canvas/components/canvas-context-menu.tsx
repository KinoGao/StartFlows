"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";

import { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";
import type { ContextMenuState } from "../types";

export function CanvasNodeContextMenu({
    menu,
    onClose,
    onDuplicate,
    onDelete,
}: {
    menu: ContextMenuState;
    onClose: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const menuRef = useRef<HTMLDivElement>(null);
    const [menuPosition, setMenuPosition] = useState(() => ({ x: menu.x, y: menu.y }));

    useLayoutEffect(() => {
        const element = menuRef.current;
        if (!element) return;
        let frame = 0;
        const updatePosition = () => {
            const padding = 8;
            const { width, height } = element.getBoundingClientRect();
            if (!width || !height) return;
            const nextPosition = {
                x: Math.min(Math.max(padding, menu.x), Math.max(padding, window.innerWidth - width - padding)),
                y: Math.min(Math.max(padding, menu.y), Math.max(padding, window.innerHeight - height - padding)),
            };
            setMenuPosition((current) => (current.x === nextPosition.x && current.y === nextPosition.y ? current : nextPosition));
        };
        const scheduleUpdate = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(updatePosition);
        };
        scheduleUpdate();
        const observer = new ResizeObserver(scheduleUpdate);
        observer.observe(element);
        window.addEventListener("resize", scheduleUpdate);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            window.removeEventListener("resize", scheduleUpdate);
        };
    }, [menu.type, menu.x, menu.y]);

    useEffect(() => {
        const close = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".ant-popover")) return;
            onClose();
        };
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        window.addEventListener("pointerdown", close);
        window.addEventListener("keydown", closeOnEscape);
        return () => {
            window.removeEventListener("pointerdown", close);
            window.removeEventListener("keydown", closeOnEscape);
        };
    }, [onClose]);

    return (
        <div
            ref={menuRef}
            className="fixed z-[80] min-w-44 overflow-hidden rounded-xl border py-1 shadow-2xl"
            style={{ left: menuPosition.x, top: menuPosition.y, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {menu.type === "node" ? <MenuButton icon={<Plus className="size-4" />} label="Duplicate" onClick={onDuplicate} /> : null}
            <MenuButton icon={<Trash2 className="size-4" />} label="Delete" onClick={onDelete} danger />
        </div>
    );
}

function MenuButton({ icon, label, onClick, danger = false }: { icon: ReactNode; label: string; onClick?: () => void; danger?: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:opacity-80" style={{ color: danger ? theme.ui.danger : theme.node.text }} onClick={onClick}>
            {icon}
            <span>{label}</span>
        </button>
    );
}
