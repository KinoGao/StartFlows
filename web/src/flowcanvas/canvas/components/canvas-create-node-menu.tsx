"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
    CircleDot,
    Clapperboard,
    Clock3,
    FileText,
    Image as ImageIcon,
    Layers3,
    Music2,
    PackagePlus,
    ScanSearch,
    Type,
    Upload,
    Video,
    Workflow,
} from "lucide-react";

import { canvasThemes, type CanvasTheme } from "@/flowcanvas/lib/canvas-theme";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";

export type CanvasCreateMenuAction =
    | "text"
    | "image"
    | "video"
    | "comfyui"
    | "videoComposition"
    | "director"
    | "panorama360"
    | "lapian"
    | "audio"
    | "script"
    | "materialLibrary"
    | "upload"
    | "generationHistory";

const MENU_WIDTH = 208;

/** 统一的「添加节点」菜单：dock +、双击空白、右键空白共用。position 为 client 坐标；placement="above" 时向上展开（底部 dock）。 */
export function CanvasCreateNodeMenu({
    position,
    placement = "auto",
    onAction,
    onClose,
}: {
    position: { x: number; y: number };
    placement?: "auto" | "above";
    onAction: (action: CanvasCreateMenuAction) => void;
    onClose: () => void;
}) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const menuRef = useRef<HTMLDivElement>(null);
    const [menuPosition, setMenuPosition] = useState(position);

    useLayoutEffect(() => {
        const element = menuRef.current;
        if (!element) return;
        let frame = 0;
        const updatePosition = () => {
            const padding = 8;
            const { width, height } = element.getBoundingClientRect();
            if (!width || !height) return;
            const rawY = placement === "above" ? position.y - height - 8 : position.y;
            const nextPosition = {
                x: Math.min(Math.max(padding, position.x), Math.max(padding, window.innerWidth - width - padding)),
                y: Math.min(Math.max(padding, rawY), Math.max(padding, window.innerHeight - height - padding)),
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
    }, [position.x, position.y, placement]);

    useEffect(() => {
        const close = (event: PointerEvent) => {
            const target = event.target;
            if (target instanceof Node && menuRef.current?.contains(target)) return;
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
            className="canvas-create-menu-enter creative-os-panel thin-scrollbar pointer-events-auto fixed z-[80] max-h-[calc(100vh-16px)] overflow-y-auto rounded-[8px] border p-2"
            style={{
                left: menuPosition.x,
                top: menuPosition.y,
                width: MENU_WIDTH,
                background: theme.ui.materialElevated,
                borderColor: theme.ui.hairline,
                color: theme.node.text,
                boxShadow: theme.ui.shadow,
            }}
            onPointerDown={(event) => event.stopPropagation()}
        >
            <div className="flex items-center justify-between px-2 pb-1.5 pt-1">
                <div className="text-xs font-medium opacity-70">添加节点</div>
            </div>
            {/* 顺序对齐 LibTV 添加菜单：文本/图片/视频/智能剪辑/导演台/逐帧拉片/音频/脚本/素材库，外加 ComfyUI 与 360场景；单行紧凑样式对齐 LibTV */}
            <CreateMenuOption theme={theme} icon={<Type className="size-4" />} label="文本" onClick={() => onAction("text")} />
            <CreateMenuOption theme={theme} icon={<ImageIcon className="size-4" />} label="图片" onClick={() => onAction("image")} />
            <CreateMenuOption theme={theme} icon={<Video className="size-4" />} label="视频" onClick={() => onAction("video")} />
            <CreateMenuOption theme={theme} icon={<Clapperboard className="size-4" />} label="智能剪辑" tag="Beta" onClick={() => onAction("videoComposition")} />
            <CreateMenuOption theme={theme} icon={<Layers3 className="size-4" />} label="导演台" tag="NEW" onClick={() => onAction("director")} />
            <CreateMenuOption theme={theme} icon={<ScanSearch className="size-4" />} label="逐帧拉片" tag="NEW" onClick={() => onAction("lapian")} />
            <CreateMenuOption theme={theme} icon={<Music2 className="size-4" />} label="音频" onClick={() => onAction("audio")} />
            <CreateMenuOption theme={theme} icon={<FileText className="size-4" />} label="脚本" tag="NEW" onClick={() => onAction("script")} />
            <CreateMenuOption theme={theme} icon={<Workflow className="size-4" />} label="ComfyUI" onClick={() => onAction("comfyui")} />
            <CreateMenuOption theme={theme} icon={<CircleDot className="size-4" />} label="360场景" tag="NEW" onClick={() => onAction("panorama360")} />
            <CreateMenuOption theme={theme} icon={<PackagePlus className="size-4" />} label="素材库" tag="NEW" onClick={() => onAction("materialLibrary")} />
            <div className="px-2 pb-1 pt-2 text-xs font-medium opacity-40">添加资源</div>
            <CreateMenuOption theme={theme} icon={<Upload className="size-4" />} label="上传" onClick={() => onAction("upload")} />
            <CreateMenuOption theme={theme} icon={<Clock3 className="size-4" />} label="从生成历史选择" onClick={() => onAction("generationHistory")} />
        </div>
    );
}

function CreateMenuOption({ theme, icon, label, tag, disabled = false, onClick }: { theme: CanvasTheme; icon: ReactNode; label: string; tag?: string; disabled?: boolean; onClick?: () => void }) {
    return (
        <button
            type="button"
            disabled={disabled}
            aria-disabled={disabled}
            className="creative-os-menu-item flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: theme.node.text }}
            onMouseEnter={(event) => (event.currentTarget.style.background = theme.toolbar.itemHover)}
            onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
            onClick={() => onClick?.()}
        >
            <span className="grid size-4 shrink-0 place-items-center opacity-70">{icon}</span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {tag ? (
                <span
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium leading-3"
                    style={tag === "NEW" ? { background: `${theme.ui.accent}1f`, color: theme.ui.accent } : { background: theme.toolbar.itemHover, color: theme.node.muted }}
                >
                    {tag}
                </span>
            ) : null}
        </button>
    );
}
