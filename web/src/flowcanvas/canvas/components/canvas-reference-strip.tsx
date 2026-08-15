"use client";

import { useEffect, useState, type FocusEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { FileText, Image as ImageIcon, Music2, Video, X } from "lucide-react";

import { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";
import { peekCachedImageUrl, resolveImageUrl } from "@/flowcanvas/services/image-storage";
import { peekCachedMediaUrl, resolveMediaUrl } from "@/flowcanvas/services/file-storage";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";

type CanvasReferenceStripProps = {
    references?: CanvasResourceReference[];
    className?: string;
    variant?: "default" | "media";
    onRemove?: (reference: CanvasResourceReference) => void;
};

type HoveredReference = {
    reference: CanvasResourceReference;
    rect: DOMRect;
};

export function CanvasReferenceStrip({ references = [], className = "", variant = "default", onRemove }: CanvasReferenceStripProps) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const activeReferences = references.filter((reference) => reference.active);
    const [hoveredReference, setHoveredReference] = useState<HoveredReference | null>(null);

    if (!activeReferences.length) return null;

    return (
        <>
            <div
                className={`nodrag nopan flex min-w-0 items-center gap-1.5 overflow-x-auto py-0.5 ${className}`}
                data-canvas-no-zoom
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onWheel={(event) => {
                    if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
                }}
                aria-label="已连接的上游引用"
            >
                {activeReferences.map((reference, index) => (
                    <ReferenceChip
                        key={reference.id}
                        reference={reference}
                        index={index}
                        theme={theme}
                        variant={variant}
                        onRemove={onRemove}
                        onPreview={(event) => setHoveredReference({ reference, rect: event.currentTarget.getBoundingClientRect() })}
                        onHidePreview={() => setHoveredReference(null)}
                    />
                ))}
            </div>
            {hoveredReference ? <ReferenceHoverPreview {...hoveredReference} /> : null}
        </>
    );
}

function ReferenceChip({
    reference,
    index,
    theme,
    variant,
    onRemove,
    onPreview,
    onHidePreview,
}: {
    reference: CanvasResourceReference;
    index: number;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    variant: "default" | "media";
    onRemove?: (reference: CanvasResourceReference) => void;
    onPreview: (event: MouseEvent<HTMLDivElement> | FocusEvent<HTMLDivElement>) => void;
    onHidePreview: () => void;
}) {
    if (variant === "media") {
        return (
            <div
                className="group/reference relative size-12 shrink-0 overflow-hidden rounded-lg border"
                style={{ background: theme.node.fill, borderColor: theme.node.stroke }}
                title={`${index + 1}. ${reference.title || reference.label}`}
                tabIndex={0}
                onMouseEnter={onPreview}
                onMouseLeave={onHidePreview}
                onFocus={onPreview}
                onBlur={onHidePreview}
            >
                <ReferenceVisual reference={reference} large />
                <span className="pointer-events-none absolute bottom-0.5 left-0.5 grid size-4 place-items-center rounded bg-black/65 text-[9px] font-semibold text-white">{index + 1}</span>
                {onRemove ? (
                    <button
                        type="button"
                        className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-black/70 text-white opacity-75 transition hover:opacity-100"
                        aria-label={`移除引用 ${reference.title || reference.label}`}
                        onClick={(event) => {
                            event.stopPropagation();
                            onRemove(reference);
                        }}
                    >
                        <X className="size-2.5" />
                    </button>
                ) : null}
            </div>
        );
    }

    return (
        <div
            className="flex h-8 min-w-0 max-w-[132px] shrink-0 cursor-default items-center gap-1.5 rounded-md border py-1 pl-1 pr-2 text-[11px] transition-colors hover:brightness-110 focus:outline-none focus:ring-1"
            style={{ background: theme.node.fill, borderColor: theme.node.stroke, color: theme.node.text, outlineColor: theme.ui.accent }}
            title={`${index + 1}. ${reference.title || reference.label}`}
            tabIndex={0}
            onMouseEnter={onPreview}
            onMouseLeave={onHidePreview}
            onFocus={onPreview}
            onBlur={onHidePreview}
        >
            <span
                className="flex size-5 shrink-0 items-center justify-center rounded-[4px] text-[10px] font-medium"
                style={{ background: theme.ui.accentSoft, color: theme.ui.accent }}
            >
                {index + 1}
            </span>
            <ReferenceVisual reference={reference} />
            <span className="truncate">{reference.title || reference.label}</span>
        </div>
    );
}

function ReferenceHoverPreview({ reference, rect }: HoveredReference) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { src, failed, setFailed } = useReferencePreviewUrl(reference);
    const isVisual = reference.kind === "image" || reference.kind === "video";
    const width = isVisual ? 248 : 288;
    const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - width - 12));
    const previewHeight = isVisual ? 190 : 146;
    const top = rect.top - previewHeight - 10 >= 12 ? rect.top - previewHeight - 10 : rect.bottom + 10;

    return createPortal(
        <div
            className="pointer-events-none fixed z-[130] overflow-hidden rounded-lg border p-2 shadow-2xl backdrop-blur-xl"
            style={{ left, top, width, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            aria-live="polite"
        >
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium" style={{ color: theme.node.muted }}>
                <ReferenceIcon kind={reference.kind} className="size-3.5" />
                <span>{reference.label}</span>
                <span className="truncate" style={{ color: theme.node.text }}>{reference.title || reference.label}</span>
            </div>
            {reference.kind === "image" && src && !failed ? (
                <img src={src} alt={reference.title || reference.label} className="h-[154px] w-full rounded-md bg-black/10 object-contain" onError={() => setFailed(true)} />
            ) : reference.kind === "video" && src && !failed ? (
                <video src={src} className="h-[154px] w-full rounded-md bg-black object-contain" muted preload="metadata" onError={() => setFailed(true)} />
            ) : reference.kind === "text" ? (
                <p className="line-clamp-6 min-h-20 whitespace-pre-wrap break-words rounded-md px-2.5 py-2 text-xs leading-5" style={{ background: theme.node.fill, color: theme.node.text }}>
                    {reference.text || reference.title || "空文本引用"}
                </p>
            ) : (
                <div className="grid h-[154px] place-items-center rounded-md text-xs" style={{ background: theme.node.fill, color: theme.node.muted }}>
                    预览暂不可用
                </div>
            )}
        </div>,
        document.body,
    );
}

function ReferenceVisual({ reference, large = false }: { reference: CanvasResourceReference; large?: boolean }) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const { src, failed, setFailed } = useReferencePreviewUrl(reference);

    if (reference.kind === "image" && src && !failed) {
        return <img className={large ? "size-full object-cover" : "size-5 shrink-0 rounded-[4px] object-cover"} src={src} alt="" loading="lazy" onError={() => setFailed(true)} />;
    }
    if (reference.kind === "video" && src && !failed) {
        return <video className={large ? "size-full object-cover" : "size-5 shrink-0 rounded-[4px] object-cover"} src={src} muted preload="metadata" aria-hidden="true" onError={() => setFailed(true)} />;
    }

    const Icon = reference.kind === "audio" ? Music2 : reference.kind === "text" ? FileText : reference.kind === "video" ? Video : ImageIcon;
    return (
        <span className={large ? "flex size-full items-center justify-center" : "flex size-5 shrink-0 items-center justify-center rounded-[4px]"} style={{ background: theme.ui.controlFill, color: theme.node.muted }}>
            <Icon className={large ? "size-5" : "size-3"} />
        </span>
    );
}

function ReferenceIcon({ kind, className }: { kind: CanvasResourceReference["kind"]; className?: string }) {
    const Icon = kind === "audio" ? Music2 : kind === "text" ? FileText : kind === "video" ? Video : ImageIcon;
    return <Icon className={className} />;
}

function useReferencePreviewUrl(reference: CanvasResourceReference) {
    const { kind, previewUrl = "", storageKey } = reference;
    const [src, setSrc] = useState(() => previewUrlFromCache(kind, storageKey, previewUrl));
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setFailed(false);
        setSrc(previewUrlFromCache(kind, storageKey, previewUrl));
        if (!storageKey || (kind !== "image" && kind !== "video")) return;
        const resolve = kind === "image" ? resolveImageUrl : resolveMediaUrl;
        void resolve(storageKey, "")
            .then((url) => {
                if (!cancelled) setSrc(url || "");
            })
            .catch(() => {
                if (!cancelled) setSrc("");
            });
        return () => {
            cancelled = true;
        };
    }, [kind, previewUrl, storageKey]);

    return { src, failed, setFailed };
}

function previewUrlFromCache(kind: CanvasResourceReference["kind"], storageKey?: string, previewUrl = "") {
    if (!storageKey) return previewUrl.startsWith("blob:") ? "" : previewUrl;
    return (kind === "image" ? peekCachedImageUrl(storageKey) : peekCachedMediaUrl(storageKey)) || "";
}
