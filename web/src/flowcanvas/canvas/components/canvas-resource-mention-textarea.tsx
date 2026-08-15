"use client";

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, PointerEvent, TextareaHTMLAttributes } from "react";
import { createPortal } from "react-dom";
import { FileText, Image as ImageIcon, Music2, Video } from "lucide-react";

import { canvasThemes } from "@/flowcanvas/lib/canvas-theme";
import { resolveMediaUrl, peekCachedMediaUrl } from "@/flowcanvas/services/file-storage";
import { resolveImageUrl, peekCachedImageUrl } from "@/flowcanvas/services/image-storage";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";

type MentionState = {
    start: number;
    query: string;
};

type Props = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> & {
    value: string;
    references: CanvasResourceReference[];
    onChange: (value: string) => void;
    onSubmit?: () => void;
    mentionRequestNonce?: number;
    containerClassName?: string;
    highlightLabels?: boolean;
    "data-canvas-no-zoom"?: boolean | "true" | "false";
};

export const CanvasResourceMentionTextarea = forwardRef<HTMLTextAreaElement, Props>(function CanvasResourceMentionTextarea(
    { value, references, onChange, onSubmit, mentionRequestNonce = 0, onKeyDown, className, containerClassName, style, highlightLabels = true, "data-canvas-no-zoom": canvasNoZoom, ...props },
    forwardedRef,
) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const overlayRef = useRef<HTMLDivElement | null>(null);
    const lastInsertRef = useRef<{ key: string; at: number } | null>(null);
    const lastMentionRequestRef = useRef(0);
    const [mention, setMention] = useState<MentionState | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [hasSelection, setHasSelection] = useState(false);
    const candidates = useMemo(() => {
        if (!mention) return [];
        const query = mention.query.trim().toLowerCase();
        const activeReferences = references.filter((item) => item.active);
        if (!query) return activeReferences;
        return activeReferences.filter((item) => `${item.label} ${item.title} ${item.kind} ${item.text || ""}`.toLowerCase().includes(query));
    }, [mention, references]);
    const activeLabels = useMemo(() => (highlightLabels ? Array.from(new Set(references.filter((item) => item.active).map((item) => item.label))).sort((a, b) => b.length - a.length) : []), [highlightLabels, references]);
    const mentionLabels = useMemo(() => Array.from(new Set(references.filter((item) => item.active).map((item) => item.label))).sort((a, b) => b.length - a.length), [references]);

    const updateValue = (next: string, selectionStart?: number) => {
        onChange(next);
        if (typeof selectionStart !== "number") return;
        requestAnimationFrame(() => {
            textareaRef.current?.focus();
            textareaRef.current?.setSelectionRange(selectionStart, selectionStart);
        });
    };

    const closeMention = () => {
        setMention(null);
        setActiveIndex(0);
    };

    const syncMention = (nextValue: string, cursor: number) => {
        const prefix = nextValue.slice(0, cursor);
        const match = /@([^\s@]*)$/.exec(prefix);
        if (!match || !references.some((item) => item.active)) {
            closeMention();
            return;
        }
        setMention({ start: cursor - match[1].length - 1, query: match[1] });
        setActiveIndex(0);
    };

    useEffect(() => {
        if (!mentionRequestNonce || lastMentionRequestRef.current === mentionRequestNonce) return;
        lastMentionRequestRef.current = mentionRequestNonce;
        const textarea = textareaRef.current;
        if (!textarea) return;
        const cursor = textarea.selectionStart ?? value.length;
        const needsSpace = cursor > 0 && !/\s/.test(value[cursor - 1] || "");
        const trigger = `${needsSpace ? " " : ""}@`;
        const next = `${value.slice(0, cursor)}${trigger}${value.slice(cursor)}`;
        const nextCursor = cursor + trigger.length;
        onChange(next);
        setMention({ start: nextCursor - 1, query: "" });
        setActiveIndex(0);
        requestAnimationFrame(() => {
            textarea.focus();
            textarea.setSelectionRange(nextCursor, nextCursor);
        });
    }, [mentionRequestNonce]);

    const insertReference = (reference: CanvasResourceReference) => {
        if (!mention) return;
        const textarea = textareaRef.current;
        const end = textarea?.selectionStart ?? value.length;
        const insertKey = `${reference.id}:${mention.start}`;
        if (lastInsertRef.current?.key === insertKey && Date.now() - lastInsertRef.current.at < 600) return;
        lastInsertRef.current = { key: insertKey, at: Date.now() };
        const insertText = `${reference.label} `;
        const next = normalizeAdjacentMentionLabels(`${value.slice(0, mention.start)}${insertText}${value.slice(end)}`, mentionLabels);
        closeMention();
        updateValue(next, Math.min(mention.start + insertText.length, next.length));
    };

    const syncOverlayScroll = () => {
        if (!overlayRef.current || !textareaRef.current) return;
        overlayRef.current.scrollTop = textareaRef.current.scrollTop;
        overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    };

    const updateSelectionState = () => {
        const textarea = textareaRef.current;
        setHasSelection(Boolean(textarea && textarea.selectionStart !== textarea.selectionEnd));
    };

    const showOverlay = Boolean(activeLabels.length && !hasSelection);
    const mergedStyle = {
        ...(style || {}),
        color: showOverlay ? "transparent" : style?.color,
        caretColor: style?.color || theme.node.text,
        ...(showOverlay ? { background: "transparent", backgroundColor: "transparent" } : {}),
    } as CSSProperties;
    const menu = mention && candidates.length && textareaRef.current ? <MentionMenu textarea={textareaRef.current} references={candidates} activeIndex={Math.min(activeIndex, candidates.length - 1)} theme={theme} onSelect={insertReference} /> : null;
    const stopCanvasInteraction = (event: PointerEvent | MouseEvent) => {
        event.stopPropagation();
    };

    return (
        <div
            data-canvas-no-zoom={canvasNoZoom}
            className={`nodrag nopan relative h-full w-full ${containerClassName || ""}`}
            onPointerDownCapture={stopCanvasInteraction}
            onMouseDownCapture={stopCanvasInteraction}
            onClickCapture={(event) => event.stopPropagation()}
        >
            {showOverlay ? (
                <div ref={overlayRef} className={`${className || ""} pointer-events-none absolute inset-0 overflow-hidden whitespace-pre-wrap break-words`} style={{ ...style, color: theme.node.text }}>
                    <MentionHighlightText value={value || props.placeholder?.toString() || ""} labels={activeLabels} placeholder={!value} />
                </div>
            ) : null}
            <textarea
                {...props}
                ref={(node) => {
                    textareaRef.current = node;
                    if (typeof forwardedRef === "function") forwardedRef(node);
                    else if (forwardedRef) forwardedRef.current = node;
                }}
                value={value}
                className={className}
                style={mergedStyle}
                onChange={(event) => {
                    const next = event.target.value;
                    onChange(next);
                    syncMention(next, event.target.selectionStart);
                    requestAnimationFrame(() => {
                        syncOverlayScroll();
                        updateSelectionState();
                    });
                }}
                onSelect={(event) => {
                    updateSelectionState();
                    props.onSelect?.(event);
                }}
                onKeyUp={(event) => {
                    updateSelectionState();
                    props.onKeyUp?.(event);
                }}
                onPointerUp={(event) => {
                    updateSelectionState();
                    props.onPointerUp?.(event);
                }}
                onKeyDown={(event) => {
                    if (mention && candidates.length && !event.nativeEvent.isComposing) {
                        if (event.key === "ArrowDown" || event.code === "ArrowDown") {
                            event.preventDefault();
                            event.stopPropagation();
                            setActiveIndex((index) => (index + 1) % candidates.length);
                            return;
                        }
                        if (event.key === "ArrowUp" || event.code === "ArrowUp") {
                            event.preventDefault();
                            event.stopPropagation();
                            setActiveIndex((index) => (index - 1 + candidates.length) % candidates.length);
                            return;
                        }
                        if (event.key === "Enter" || event.code === "Enter" || event.code === "NumpadEnter") {
                            event.preventDefault();
                            event.stopPropagation();
                            insertReference(candidates[Math.min(activeIndex, candidates.length - 1)]);
                            return;
                        }
                        if (event.key === "Escape" || event.code === "Escape") {
                            event.preventDefault();
                            event.stopPropagation();
                            closeMention();
                            return;
                        }
                    }
                    if ((event.key === "Enter" || event.code === "Enter" || event.code === "NumpadEnter") && onSubmit && !event.nativeEvent.isComposing && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
                        event.preventDefault();
                        event.stopPropagation();
                        onSubmit();
                        return;
                    }
                    onKeyDown?.(event);
                }}
                onScroll={(event) => {
                    syncOverlayScroll();
                    props.onScroll?.(event);
                }}
                onBlur={(event) => {
                    setHasSelection(false);
                    window.setTimeout(closeMention, 120);
                    props.onBlur?.(event);
                }}
            />
            {menu}
        </div>
    );
});

function MentionHighlightText({ value, labels, placeholder }: { value: string; labels: string[]; placeholder: boolean }) {
    if (placeholder) return <span className="opacity-45">{value}</span>;
    if (!labels.length) return <>{value}</>;
    const pattern = new RegExp(`(${labels.map(escapeRegExp).join("|")})`, "g");
    return (
        <>
            {value.split(pattern).map((part, index) =>
                labels.includes(part) ? (
                    <span key={`${part}-${index}`} className="rounded-md bg-[#2f80ff]/16 px-1 py-0.5 font-medium text-[#2f80ff] ring-1 ring-[#2f80ff]/24">
                        {part}
                    </span>
                ) : (
                    <span key={`${part}-${index}`}>{part}</span>
                ),
            )}
        </>
    );
}

function MentionMenu({
    textarea,
    references,
    activeIndex,
    theme,
    onSelect,
}: {
    textarea: HTMLTextAreaElement;
    references: CanvasResourceReference[];
    activeIndex: number;
    theme: (typeof canvasThemes)[keyof typeof canvasThemes];
    onSelect: (reference: CanvasResourceReference) => void;
}) {
    const selectedRef = useRef(false);
    const rect = textarea.getBoundingClientRect();
    const boundary = textarea.closest(".ant-modal-content")?.getBoundingClientRect() || { left: 8, top: 8, right: window.innerWidth - 8, bottom: window.innerHeight - 8 };
    const menuWidth = 256;
    const maxMenuHeight = 224;
    const gap = 6;
    const left = clamp(rect.left, boundary.left + 8, boundary.right - menuWidth - 8);
    const showAbove = rect.bottom + gap + maxMenuHeight > boundary.bottom && rect.top - gap - maxMenuHeight >= boundary.top;
    const top = clamp(showAbove ? rect.top - gap - maxMenuHeight : rect.bottom + gap, boundary.top + 8, boundary.bottom - maxMenuHeight - 8);

    const stopCanvasInteraction = (event: PointerEvent | MouseEvent) => {
        event.stopPropagation();
    };
    const selectReference = (reference: CanvasResourceReference) => {
        if (selectedRef.current) return;
        selectedRef.current = true;
        onSelect(reference);
    };

    return createPortal(
        <div
            data-canvas-resource-mention-menu="true"
            data-canvas-no-zoom
            className="fixed z-[120] max-h-56 w-64 overflow-y-auto rounded-xl border p-1 shadow-2xl backdrop-blur-md"
            style={{ left, top, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={stopCanvasInteraction}
            onMouseDown={stopCanvasInteraction}
            onClick={(event) => event.stopPropagation()}
        >
            {references.map((reference, index) => (
                <button
                    key={reference.id}
                    type="button"
                    className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition"
                    style={{ background: index === activeIndex ? theme.toolbar.activeBg : "transparent", color: index === activeIndex ? theme.toolbar.activeText : theme.node.text }}
                    onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectReference(reference);
                    }}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectReference(reference);
                    }}
                >
                    <ReferencePreview reference={reference} />
                    <span className="min-w-0 flex-1">
                        <span className="block font-medium">{reference.label}</span>
                        <span className="block truncate opacity-65">{reference.text || reference.title}</span>
                    </span>
                </button>
            ))}
        </div>,
        document.body,
    );
}

function ReferencePreview({ reference }: { reference: CanvasResourceReference }) {
    const { kind, previewUrl, storageKey } = reference;
    const [src, setSrc] = useState(() => resolvePreviewUrlFromCache(kind, storageKey, previewUrl));
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setFailed(false);
        setSrc(resolvePreviewUrlFromCache(kind, storageKey, previewUrl));
        if (!storageKey) return;
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

    if (kind === "image" && src && !failed) return <img src={src} alt="" className="size-9 rounded-md object-cover" onError={() => setFailed(true)} />;
    if (kind === "video" && src && !failed) return <video src={src} className="size-9 rounded-md bg-black object-cover" muted preload="metadata" onError={() => setFailed(true)} />;
    const Icon = kind === "audio" ? Music2 : kind === "video" ? Video : kind === "image" ? ImageIcon : FileText;
    return (
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/10">
            <Icon className="size-4" />
        </span>
    );
}

function resolvePreviewUrlFromCache(kind: CanvasResourceReference["kind"], storageKey?: string, previewUrl = "") {
    if (!storageKey) return previewUrl.startsWith("blob:") ? "" : previewUrl;
    return (kind === "image" ? peekCachedImageUrl(storageKey) : peekCachedMediaUrl(storageKey)) || "";
}

function clamp(value: number, min: number, max: number) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeAdjacentMentionLabels(value: string, labels: string[]) {
    let next = value.replace(/(【[^】]+】)(?:\s+\1)+/g, "$1");
    const uniqueLabels = Array.from(new Set(labels.filter(Boolean))).sort((a, b) => b.length - a.length);
    uniqueLabels.forEach((label) => {
        [label, `【${label}】`].forEach((variant) => {
            const escapedLabel = escapeRegExp(variant);
            next = next.replace(new RegExp(`(${escapedLabel})(?:\\s+${escapedLabel})+(?=\\s|$)`, "g"), "$1");
        });
    });
    return next;
}
