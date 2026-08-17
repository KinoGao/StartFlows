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
    | "audio"
    | "script"
    | "materialLibrary"
    | "upload"
    | "generationHistory";

const MENU_WIDTH = 272;

/** 统一的「添加节点」菜单：右侧 dock +、双击空白、右键空白三个入口共用（对齐 TapNow）。position 为 client 坐标。 */
export function CanvasCreateNodeMenu({
    position,
    onAction,
    onClose,
}: {
    position: { x: number; y: number };
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
            const nextPosition = {
                x: Math.min(Math.max(padding, position.x), Math.max(padding, window.innerWidth - width - padding)),
                y: Math.min(Math.max(padding, position.y), Math.max(padding, window.innerHeight - height - padding)),
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
    }, [position.x, position.y]);

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
            <div className="flex items-center justify-between px-2 pb-2">
                <div className="text-xs font-medium opacity-70">添加节点</div>
                <div className="text-[10px] opacity-35">画布工具</div>
            </div>
            <div className="px-2 pb-1 pt-1 text-xs font-medium opacity-60">媒体节点</div>
            <CreateMenuOption theme={theme} icon={<Type className="size-4" />} label="文本" description="设置 · 台词 · 剧情说明" onClick={() => onAction("text")} />
            <CreateMenuOption theme={theme} icon={<ImageIcon className="size-4" />} label="图片" description="宣传图 · 海报 · 封面" onClick={() => onAction("image")} />
            <CreateMenuOption theme={theme} icon={<Video className="size-4" />} label="视频" description="宣传视频 · 动画 · 电影" onClick={() => onAction("video")} />
            <CreateMenuOption theme={theme} icon={<Music2 className="size-4" />} label="音频" description="音乐 · 配音 · 音效" onClick={() => onAction("audio")} />
            <div className="px-2 pb-1 pt-2 text-xs font-medium opacity-60">创作能力</div>
            <CreateMenuOption theme={theme} icon={<FileText className="size-4" />} label="脚本" description="脚本、分镜与逐 beat 生成" onClick={() => onAction("script")} />
            <CreateMenuOption theme={theme} icon={<Workflow className="size-4" />} label="ComfyUI" description="连接自定义工作流" onClick={() => onAction("comfyui")} />
            <CreateMenuOption theme={theme} icon={<Clapperboard className="size-4" />} label="剪辑时间线" description="时间轴串联多段素材" tag="Beta" onClick={() => onAction("videoComposition")} />
            <CreateMenuOption theme={theme} icon={<Layers3 className="size-4" />} label="导演台" description="在 3D 空间搭建场景" tag="NEW" onClick={() => onAction("director")} />
            <CreateMenuOption theme={theme} icon={<CircleDot className="size-4" />} label="360场景" description="生成沉浸式全景素材" tag="NEW" onClick={() => onAction("panorama360")} />
            <CreateMenuOption theme={theme} icon={<Layers3 className="size-4" />} label="3D 世界" description="空间创作能力即将开放" tag="Beta" disabled />
            <div className="px-2 pb-1 pt-2 text-xs font-medium opacity-60">添加资源</div>
            <CreateMenuOption theme={theme} icon={<PackagePlus className="size-4" />} label="素材库" description="复用账号素材与风格" tag="NEW" onClick={() => onAction("materialLibrary")} />
            <CreateMenuOption theme={theme} icon={<Upload className="size-4" />} label="上传" description="图片、视频、音频与文件" onClick={() => onAction("upload")} />
            <CreateMenuOption theme={theme} icon={<Clock3 className="size-4" />} label="从生成历史选择" description="回到已有生成结果" onClick={() => onAction("generationHistory")} />
        </div>
    );
}

function CreateMenuOption({ theme, icon, label, description, tag, disabled = false, onClick }: { theme: CanvasTheme; icon: ReactNode; label: string; description?: string; tag?: string; disabled?: boolean; onClick?: () => void }) {
    return (
        <button
            type="button"
            disabled={disabled}
            aria-disabled={disabled}
            className="creative-os-menu-item flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] transition disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: theme.node.text }}
            onMouseEnter={(event) => (event.currentTarget.style.background = theme.toolbar.itemHover)}
            onMouseLeave={(event) => (event.currentTarget.style.background = "transparent")}
            onClick={() => onClick?.()}
        >
            <span className="grid size-7 shrink-0 place-items-center rounded-md" style={{ background: theme.toolbar.activeBg, color: theme.ui.accent }}>{icon}</span>
            <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{label}</span>
                {description ? <span className="mt-0.5 block truncate text-[10px] opacity-50">{description}</span> : null}
            </span>
            {tag ? <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold leading-3" style={{ background: theme.toolbar.activeBg, color: theme.toolbar.activeText }}>{tag}</span> : null}
        </button>
    );
}
