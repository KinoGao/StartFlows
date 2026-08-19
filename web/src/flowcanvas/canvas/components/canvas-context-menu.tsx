"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ClipboardPaste, Download, FolderPlus, Plus, Redo2, Trash2, Undo2, Upload } from "lucide-react";

import { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";
import type { ContextMenuState } from "../types";

export function CanvasNodeContextMenu({
    menu,
    onClose,
    onDuplicate,
    onDelete,
    canDownload = false,
    canSaveAsset = false,
    onDownload,
    onSaveAsset,
}: {
    menu: ContextMenuState;
    onClose: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    canDownload?: boolean;
    canSaveAsset?: boolean;
    onDownload?: () => void;
    onSaveAsset?: () => void;
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
            {menu.type === "node" ? <MenuButton icon={<Plus className="size-4" />} label="创建副本" onClick={onDuplicate} /> : null}
            {menu.type === "node" && canDownload ? <MenuButton icon={<Download className="size-4" />} label="下载" onClick={onDownload} /> : null}
            {menu.type === "node" && canSaveAsset ? <MenuButton icon={<FolderPlus className="size-4" />} label="加入我的素材" onClick={onSaveAsset} /> : null}
            <MenuButton icon={<Trash2 className="size-4" />} label="删除" onClick={onDelete} danger />
        </div>
    );
}

function MenuButton({ icon, label, onClick, danger = false, disabled = false, shortcut }: { icon: ReactNode; label: string; onClick?: () => void; danger?: boolean; disabled?: boolean; shortcut?: string }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];

    return (
        <button
            type="button"
            disabled={disabled}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:opacity-80 disabled:cursor-default disabled:opacity-35 disabled:hover:opacity-35"
            style={{ color: danger ? theme.ui.danger : theme.node.text }}
            onClick={onClick}
        >
            {icon}
            <span>{label}</span>
            {shortcut ? <span className="ml-auto pl-6 text-[10px]" style={{ color: theme.node.muted }}>{shortcut}</span> : null}
        </button>
    );
}

/** 画布空白区域右键菜单（对齐 LibTV：上传/保存到我的资产/添加节点/撤销/重做/粘贴）。 */
export function CanvasContextMenu({
    menu,
    canUndo,
    canRedo,
    canPaste,
    canSaveAsset = false,
    onClose,
    onUpload,
    onSaveAsset,
    onAddNode,
    onUndo,
    onRedo,
    onPaste,
}: {
    menu: { x: number; y: number };
    canUndo: boolean;
    canRedo: boolean;
    canPaste: boolean;
    /** 有选中节点且含可存素材内容时可用（对齐 LibTV 空白右键的「保存到我的资产」） */
    canSaveAsset?: boolean;
    onClose: () => void;
    onUpload: () => void;
    onSaveAsset?: () => void;
    onAddNode: () => void;
    onUndo: () => void;
    onRedo: () => void;
    onPaste: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const menuRef = useRef<HTMLDivElement>(null);
    const [menuPosition, setMenuPosition] = useState(() => ({ x: menu.x, y: menu.y }));

    useLayoutEffect(() => {
        const element = menuRef.current;
        if (!element) return;
        const padding = 8;
        const { width, height } = element.getBoundingClientRect();
        if (!width || !height) return;
        setMenuPosition({
            x: Math.min(Math.max(padding, menu.x), Math.max(padding, window.innerWidth - width - padding)),
            y: Math.min(Math.max(padding, menu.y), Math.max(padding, window.innerHeight - height - padding)),
        });
    }, [menu.x, menu.y]);

    useEffect(() => {
        const close = () => onClose();
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
            <MenuButton icon={<Upload className="size-4" />} label="上传" onClick={onUpload} />
            <MenuButton icon={<FolderPlus className="size-4" />} label="保存到我的资产" disabled={!canSaveAsset} onClick={onSaveAsset} />
            <MenuButton icon={<Plus className="size-4" />} label="添加节点" onClick={onAddNode} />
            <div className="mx-2 my-1 border-t" style={{ borderColor: theme.toolbar.border }} />
            <MenuButton icon={<Undo2 className="size-4" />} label="撤销" shortcut="Ctrl+Z" disabled={!canUndo} onClick={onUndo} />
            <MenuButton icon={<Redo2 className="size-4" />} label="重做" shortcut="Ctrl+Shift+Z" disabled={!canRedo} onClick={onRedo} />
            <div className="mx-2 my-1 border-t" style={{ borderColor: theme.toolbar.border }} />
            <MenuButton icon={<ClipboardPaste className="size-4" />} label="粘贴" shortcut="Ctrl+V" disabled={!canPaste} onClick={onPaste} />
        </div>
    );
}
