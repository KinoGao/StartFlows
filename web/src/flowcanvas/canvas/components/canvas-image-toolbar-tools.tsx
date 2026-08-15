"use client";

import type { ReactNode } from "react";
import { Brush, Camera, CircleDot, Copy, Expand, FileText, Globe, Grid2x2, Lock, LockOpen, Maximize2, PersonStanding, Scissors, SunMedium, Upload, ZoomIn } from "lucide-react";

import type { CanvasNodeData } from "../types";

export type ImageNodeActionToolId = "copyPrompt" | "reversePrompt" | "replace" | "panorama360" | "resize" | "maskEdit" | "crop" | "split" | "upscale" | "angle" | "outpaint" | "lighting" | "cutout" | "panorama720" | "view";
export type ImageQuickToolId = "info" | "delete" | "saveAsset" | "download" | "edit" | ImageNodeActionToolId;

export type ImageToolHandlers = {
    onUpload: (node: CanvasNodeData) => void;
    onMarkPanorama360: (node: CanvasNodeData) => void;
    onToggleFreeResize: (node: CanvasNodeData) => void;
    onMaskEdit: (node: CanvasNodeData) => void;
    onCrop: (node: CanvasNodeData) => void;
    onSplit: (node: CanvasNodeData) => void;
    onUpscale: (node: CanvasNodeData) => void;    onAngle: (node: CanvasNodeData) => void;
    onOutpaint: (node: CanvasNodeData) => void;
    onLighting: (node: CanvasNodeData) => void;
    onCutout: (node: CanvasNodeData) => void;
    onPanorama720: (node: CanvasNodeData) => void;
    onViewImage: (node: CanvasNodeData) => void;
    onCopyPrompt: (node: CanvasNodeData) => void;
    onReversePrompt: (node: CanvasNodeData) => void;
};

export type ImageToolDefinition = {
    id: ImageNodeActionToolId;
    defaultVisible: boolean;
    panelLabel: string;
    label: string | ((node: CanvasNodeData) => string);
    title: string | ((node: CanvasNodeData) => string);
    icon: (node: CanvasNodeData) => ReactNode;
    active?: (node: CanvasNodeData) => boolean;
    run: (node: CanvasNodeData, handlers: ImageToolHandlers) => void;
};

export type ImageQuickToolsConfig = {
    ids: ImageQuickToolId[];
    showLabels: boolean;
};

export const IMAGE_QUICK_TOOLS_STORAGE_KEY = "canvas-image-quick-tools-v7";

const defaultBaseToolIds: ImageQuickToolId[] = ["info", "delete", "saveAsset", "download", "edit"];

export const imageToolDefinitions: ImageToolDefinition[] = [
    {
        id: "copyPrompt",
        defaultVisible: true,
        panelLabel: "复制提示词",
        label: "复制提示词",
        title: "复制生成该图片的提示词",
        icon: () => <Copy className="size-4" />,
        run: (node, handlers) => handlers.onCopyPrompt(node),
    },
    {
        id: "reversePrompt",
        defaultVisible: true,
        panelLabel: "反推提示词",
        label: "反推提示词",
        title: "创建反推提示词的文本和配置节点",
        icon: () => <FileText className="size-4" />,
        run: (node, handlers) => handlers.onReversePrompt(node),
    },
    {
        id: "replace",
        defaultVisible: true,
        panelLabel: "替换图片",
        label: "替换图片",
        title: "替换图片",
        icon: () => <Upload className="size-4" />,
        run: (node, handlers) => handlers.onUpload(node),
    },
    {
        id: "panorama360",
        defaultVisible: true,
        panelLabel: "360场景",
        label: "360场景",
        title: (node) => (node.metadata?.canvasTool === "panorama360" ? "已标记为360场景，三击进入全景预览" : "标记为360场景，之后三击进入全景预览"),
        icon: () => <CircleDot className="size-4" />,
        active: (node) => node.metadata?.canvasTool === "panorama360",
        run: (node, handlers) => handlers.onMarkPanorama360(node),
    },
    {
        id: "resize",
        defaultVisible: false,
        panelLabel: "锁比例",
        label: (node) => (node.metadata?.freeResize ? "自由比例" : "锁比例"),
        title: (node) => (node.metadata?.freeResize ? "切换为等比缩放" : "切换为自由比例"),
        icon: (node) => (node.metadata?.freeResize ? <LockOpen className="size-4" /> : <Lock className="size-4" />),
        active: (node) => Boolean(node.metadata?.freeResize),
        run: (node, handlers) => handlers.onToggleFreeResize(node),
    },
    {
        id: "maskEdit",
        defaultVisible: true,
        panelLabel: "局部编辑",
        label: "局部编辑",
        title: "添加蒙版遮罩后局部修改",
        icon: () => <Brush className="size-4" />,
        run: (node, handlers) => handlers.onMaskEdit(node),
    },
    {
        id: "crop",
        defaultVisible: true,
        panelLabel: "裁剪",
        label: "裁剪",
        title: "裁剪并生成新节点",
        icon: () => <Scissors className="size-4" />,
        run: (node, handlers) => handlers.onCrop(node),
    },
    {
        id: "split",
        defaultVisible: true,
        panelLabel: "切图",
        label: "切图",
        title: "按行列切分图片",
        icon: () => <Grid2x2 className="size-4" />,
        run: (node, handlers) => handlers.onSplit(node),
    },
    {
        id: "upscale",
        defaultVisible: true,
        panelLabel: "放大",
        label: "放大",
        title: "放大图片分辨率",
        icon: () => <ZoomIn className="size-4" />,
        run: (node, handlers) => handlers.onUpscale(node),
    },
    {
        id: "angle",
        defaultVisible: false,
        panelLabel: "多角度",
        label: "多角度",
        title: "生成角度",
        icon: () => <Camera className="size-4" />,
        run: (node, handlers) => handlers.onAngle(node),
    },
    {
        id: "outpaint",
        defaultVisible: true,
        panelLabel: "扩图",
        label: "扩图",
        title: "选择画幅并以当前图为参考向外延展画面",
        icon: () => <Expand className="size-4" />,
        run: (node, handlers) => handlers.onOutpaint(node),
    },
    {
        id: "lighting",
        defaultVisible: true,
        panelLabel: "打光",
        label: "打光",
        title: "调整主光方向、光色和强度",
        icon: () => <SunMedium className="size-4" />,
        run: (node, handlers) => handlers.onLighting(node),
    },
    {
        id: "cutout",
        defaultVisible: false,
        panelLabel: "抠图",
        label: "抠图",
        title: "提取画面主体并替换为纯色背景",
        icon: () => <PersonStanding className="size-4" />,
        run: (node, handlers) => handlers.onCutout(node),
    },
    {
        id: "panorama720",
        defaultVisible: false,
        panelLabel: "720全景",
        label: "720全景",
        title: "以当前图为参考生成 720° 全景图",
        icon: () => <Globe className="size-4" />,
        run: (node, handlers) => handlers.onPanorama720(node),
    },
    {
        id: "view",
        defaultVisible: true,
        panelLabel: "查看大图",
        label: "查看大图",
        title: "查看图片详情",
        icon: () => <Maximize2 className="size-4" />,
        run: (node, handlers) => handlers.onViewImage(node),
    },
];

export const defaultImageQuickToolIds: ImageQuickToolId[] = [...defaultBaseToolIds, ...imageToolDefinitions.filter((tool) => tool.defaultVisible).map((tool) => tool.id)];

export function buildImageToolbarTools(node: CanvasNodeData, handlers: ImageToolHandlers) {
    return imageToolDefinitions.map((tool) => ({
        id: tool.id,
        label: resolveToolText(tool.label, node),
        title: resolveToolText(tool.title, node),
        icon: tool.icon(node),
        active: tool.active?.(node),
        onClick: () => tool.run(node, handlers),
    }));
}

export function normalizeImageQuickToolIds(value: unknown[]) {
    const allIds: ImageQuickToolId[] = [...defaultBaseToolIds, ...imageToolDefinitions.map((tool) => tool.id)];
    const ids = new Set(allIds);
    return allIds.filter((id) => value.includes(id) && ids.has(id));
}

export function readImageQuickToolsConfig(value: unknown): ImageQuickToolsConfig {
    if (Array.isArray(value)) return { ids: normalizeImageQuickToolIds(value), showLabels: true };
    if (!value || typeof value !== "object") return { ids: defaultImageQuickToolIds, showLabels: true };
    const data = value as Partial<ImageQuickToolsConfig>;
    return {
        ids: Array.isArray(data.ids) ? normalizeImageQuickToolIds(data.ids) : defaultImageQuickToolIds,
        showLabels: data.showLabels !== false,
    };
}

function resolveToolText(value: string | ((node: CanvasNodeData) => string), node: CanvasNodeData) {
    return typeof value === "function" ? value(node) : value;
}
