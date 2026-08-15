"use client";

import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

import type { CreativeAsset } from "@/lib/creative-runtime-contract";
import { cn } from "@/lib/utils";

import { CREATIVE_RESULT_VIEWPORT_MAX_HEIGHT } from "./creative-asset-layout";

export function hasMultipleCreativeResults(results: readonly unknown[]) {
    return results.length > 1;
}

export function useSelectedCreativeResult(results: CreativeAsset[]) {
    const [selectedId, setSelectedId] = useState(results[0]?.id || "");
    const selectedIndex = Math.max(
        0,
        results.findIndex((result) => result.id === selectedId),
    );
    const selectedResult = results[selectedIndex];

    useEffect(() => {
        if (!results.some((result) => result.id === selectedId)) setSelectedId(results[0]?.id || "");
    }, [results, selectedId]);

    return { selectedResult, selectedIndex, selectResult: (index: number) => setSelectedId(results[index]?.id || results[0]?.id || "") };
}

export function CreativeResultSwitcher({
    results,
    selectedIndex,
    width,
    height,
    thumbnailWidth = 76,
    sideThumbnailWidth = 64,
    renderThumbnail,
    onSelect,
    className,
}: {
    results: CreativeAsset[];
    selectedIndex: number;
    width: number | string;
    height: number;
    thumbnailWidth?: number;
    sideThumbnailWidth?: number;
    renderThumbnail: (result: CreativeAsset, index: number) => ReactNode;
    onSelect: (index: number) => void;
    className?: string;
}) {
    const stripRef = useRef<HTMLDivElement>(null);
    const selectedRef = useRef<HTMLButtonElement>(null);
    const [scrollState, setScrollState] = useState({ axis: "horizontal" as "horizontal" | "vertical", overflow: false, previous: false, next: false });

    useEffect(() => {
        if (!hasMultipleCreativeResults(results)) return;
        const strip = stripRef.current;
        if (!strip) return;
        const update = () => {
            const vertical = window.getComputedStyle(strip).flexDirection === "column";
            const position = vertical ? strip.scrollTop : strip.scrollLeft;
            const maximum = Math.max(0, vertical ? strip.scrollHeight - strip.clientHeight : strip.scrollWidth - strip.clientWidth);
            setScrollState({ axis: vertical ? "vertical" : "horizontal", overflow: maximum > 0, previous: position > 0, next: position < maximum });
        };
        const frame = window.requestAnimationFrame(update);
        const resizeObserver = new ResizeObserver(update);
        resizeObserver.observe(strip);
        strip.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update, { passive: true });
        return () => {
            window.cancelAnimationFrame(frame);
            resizeObserver.disconnect();
            strip.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
        };
    }, [results]);

    useEffect(() => {
        selectedRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }, [selectedIndex]);

    if (!hasMultipleCreativeResults(results)) return null;
    const scroll = (direction: -1 | 1) => {
        const strip = stripRef.current;
        if (!strip) return;
        const distance = direction * (scrollState.axis === "vertical" ? strip.clientHeight : strip.clientWidth);
        strip.scrollBy(scrollState.axis === "vertical" ? { top: distance, behavior: "smooth" } : { left: distance, behavior: "smooth" });
    };
    const selectFromKeyboard = (event: KeyboardEvent<HTMLDivElement>) => {
        const previousKey = scrollState.axis === "vertical" ? "ArrowUp" : "ArrowLeft";
        const nextKey = scrollState.axis === "vertical" ? "ArrowDown" : "ArrowRight";
        const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? results.length - 1 : event.key === previousKey ? Math.max(0, selectedIndex - 1) : event.key === nextKey ? Math.min(results.length - 1, selectedIndex + 1) : selectedIndex;
        if (nextIndex === selectedIndex) return;
        event.preventDefault();
        onSelect(nextIndex);
    };
    const style = {
        "--creative-result-switcher-width": cssLength(width),
        "--creative-result-thumbnail-mobile-width": `${thumbnailWidth}px`,
        "--creative-result-thumbnail-side-width": `${sideThumbnailWidth}px`,
        "--creative-result-switcher-height": `min(${height}px, ${CREATIVE_RESULT_VIEWPORT_MAX_HEIGHT}dvh)`,
    } as CSSProperties;
    const PreviousIcon = scrollState.axis === "vertical" ? ChevronUp : ChevronLeft;
    const NextIcon = scrollState.axis === "vertical" ? ChevronDown : ChevronRight;

    return (
        <div
            data-testid="creative-result-switcher"
            data-results-count={results.length}
            data-orientation={scrollState.axis}
            data-overflow={scrollState.overflow}
            className={cn("mt-3 w-[var(--creative-result-switcher-width)] max-w-full sm:mt-0 sm:flex sm:h-[var(--creative-result-switcher-height)] sm:w-[var(--creative-result-thumbnail-side-width)] sm:flex-col", className)}
            style={style}
        >
            <div className={cn("mb-2 flex h-8 items-center justify-between gap-3 sm:shrink-0 sm:gap-1", scrollState.overflow ? "sm:grid sm:h-10 sm:grid-cols-[minmax(0,1fr)_20px] sm:grid-rows-2 sm:gap-x-1 sm:gap-y-0" : "sm:h-6")}>
                <span className="whitespace-nowrap text-xs font-medium leading-5 text-[#7b8491] dark:text-[#8f99a6] sm:col-start-1 sm:row-start-1">更多</span>
                <span
                    data-testid="creative-result-position"
                    className="mr-auto whitespace-nowrap text-[10px] tabular-nums leading-4 text-[#98a2b3] dark:text-[#7f8996] sm:col-start-1 sm:row-start-2"
                    aria-label={`第 ${selectedIndex + 1} 项，共 ${results.length} 项`}
                >
                    {selectedIndex + 1} / {results.length}
                </span>
                {scrollState.overflow ? (
                    <div className="flex items-center gap-1 sm:contents">
                        <button
                            type="button"
                            className="grid size-8 place-items-center rounded-lg border border-[#e4e7ec] bg-white text-[#667085] transition hover:border-[#cfd4dc] hover:bg-[#f8f9fb] disabled:cursor-not-allowed disabled:opacity-35 dark:border-[#343a43] dark:bg-[#181b20] dark:text-[#aab2bc] dark:hover:bg-[#22262c] sm:col-start-2 sm:row-start-1 sm:size-5 sm:rounded-md"
                            disabled={!scrollState.previous}
                            onClick={() => scroll(-1)}
                            aria-label="查看上一组生成结果"
                        >
                            <PreviousIcon className="size-4 sm:size-3.5" />
                        </button>
                        <button
                            type="button"
                            className="grid size-8 place-items-center rounded-lg border border-[#e4e7ec] bg-white text-[#667085] transition hover:border-[#cfd4dc] hover:bg-[#f8f9fb] disabled:cursor-not-allowed disabled:opacity-35 dark:border-[#343a43] dark:bg-[#181b20] dark:text-[#aab2bc] dark:hover:bg-[#22262c] sm:col-start-2 sm:row-start-2 sm:size-5 sm:rounded-md"
                            disabled={!scrollState.next}
                            onClick={() => scroll(1)}
                            aria-label="查看更多生成结果"
                        >
                            <NextIcon className="size-4 sm:size-3.5" />
                        </button>
                    </div>
                ) : null}
            </div>
            <div ref={stripRef} className="hide-scrollbar flex max-w-full gap-2 overflow-x-auto pb-1 sm:min-h-0 sm:flex-1 sm:flex-col sm:overflow-x-hidden sm:overflow-y-auto sm:pb-0 sm:pr-1" aria-label="更多生成结果" onKeyDown={selectFromKeyboard}>
                {results.map((result, index) => {
                    const selected = index === selectedIndex;
                    return (
                        <button
                            ref={selected ? selectedRef : undefined}
                            key={result.id}
                            type="button"
                            className={cn(
                                "relative h-16 w-[var(--creative-result-thumbnail-mobile-width)] shrink-0 overflow-hidden rounded-lg border bg-[#f5f6f8] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 dark:bg-[#22262c] sm:h-12 sm:w-full",
                                selected ? "border-transparent" : "border-[#e4e7ec] hover:border-[#b8bdc7] dark:border-[#383e47] dark:hover:border-[#59616c]",
                            )}
                            onClick={() => onSelect(index)}
                            aria-label={`查看生成结果 ${index + 1}`}
                            aria-pressed={selected}
                        >
                            <span data-thumbnail-content className={cn("absolute overflow-hidden", selected ? "inset-[2px] rounded-[6px]" : "inset-0 rounded-[inherit]")}>
                                {renderThumbnail(result, index)}
                            </span>
                            {selected ? <span data-selected-outline aria-hidden className="pointer-events-none absolute inset-0 z-10 rounded-[inherit] border-2 border-primary" /> : null}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function cssLength(value: number | string) {
    return typeof value === "number" ? `${value}px` : value;
}
