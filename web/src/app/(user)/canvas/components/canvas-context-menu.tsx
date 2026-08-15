"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import type { ContextMenuState } from "../types";

export function CanvasNodeContextMenu({ menu, onClose, onDuplicate, onDelete }: { menu: ContextMenuState; onClose: () => void; onDuplicate: () => void; onDelete: () => void }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ x: menu.x, y: menu.y });

    useLayoutEffect(() => {
        const element = menuRef.current;
        if (!element) return;
        const update = () => setPosition(clampCanvasContextMenuPosition({ x: menu.x, y: menu.y }, { width: element.offsetWidth, height: element.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }));
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, [menu]);

    useEffect(() => {
        const close = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Element && target.closest(".ant-popover")) return;
            onClose();
        };
        window.addEventListener("pointerdown", close);
        return () => window.removeEventListener("pointerdown", close);
    }, [onClose]);

    return (
        <div
            ref={menuRef}
            role="menu"
            className="fixed z-[80] min-w-44 overflow-hidden rounded-xl border py-1 shadow-2xl"
            style={{ left: position.x, top: position.y, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            {menu.type === "node" ? <MenuButton icon={<Plus className="size-4" />} label="复制" onClick={onDuplicate} /> : null}
            <MenuButton icon={<Trash2 className="size-4" />} label="删除" onClick={onDelete} danger />
        </div>
    );
}

function MenuButton({ icon, label, onClick, danger = false }: { icon: ReactNode; label: string; onClick?: () => void; danger?: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <button type="button" role="menuitem" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:opacity-80" style={{ color: danger ? "#f87171" : theme.node.text }} onClick={onClick}>
            {icon}
            <span>{label}</span>
        </button>
    );
}

export function clampCanvasContextMenuPosition(anchor: { x: number; y: number }, menu: { width: number; height: number }, viewport: { width: number; height: number }) {
    const margin = 8;
    return {
        x: Math.max(margin, Math.min(anchor.x, viewport.width - menu.width - margin)),
        y: Math.max(margin, Math.min(anchor.y, viewport.height - menu.height - margin)),
    };
}
