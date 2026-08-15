"use client";

import { Children, type ReactNode, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const MASONRY_ROW_HEIGHT = 4;

export function masonryRowSpan(contentHeight: number, rowHeight: number, rowGap: number) {
    return Math.max(1, Math.ceil((contentHeight + rowGap) / (rowHeight + rowGap)));
}

export function masonryPlacements(rowSpans: number[], columnCount: number) {
    const columnEnds = Array.from({ length: Math.max(1, Math.floor(columnCount)) }, () => 0);
    return rowSpans.map((value) => {
        const rowSpan = Math.max(1, Math.ceil(value));
        let columnIndex = 0;
        for (let index = 1; index < columnEnds.length; index += 1) {
            if (columnEnds[index] < columnEnds[columnIndex]) columnIndex = index;
        }
        const rowStart = columnEnds[columnIndex] + 1;
        columnEnds[columnIndex] += rowSpan;
        return { column: columnIndex + 1, rowStart, rowSpan };
    });
}

export function ResponsiveMasonryGrid({ children, className, ariaLabel }: { children: ReactNode; className: string; ariaLabel: string }) {
    const gridRef = useRef<HTMLDivElement>(null);
    const [measured, setMeasured] = useState(false);

    useLayoutEffect(() => {
        const grid = gridRef.current;
        if (!grid) return;
        const items = Array.from(grid.children) as HTMLElement[];
        let frame = 0;
        const layout = () => {
            items.forEach((item) => {
                item.style.removeProperty("grid-column-start");
                item.style.removeProperty("grid-row-start");
                item.style.removeProperty("grid-row-end");
            });
            const rowGap = Number.parseFloat(getComputedStyle(grid).rowGap) || 0;
            const columnCount = getComputedStyle(grid).gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length;
            const rowSpans = items.map((item) => masonryRowSpan((item.firstElementChild as HTMLElement | null)?.getBoundingClientRect().height || 0, MASONRY_ROW_HEIGHT, rowGap));
            masonryPlacements(rowSpans, columnCount).forEach((placement, index) => {
                const item = items[index];
                item.style.gridColumnStart = String(placement.column);
                item.style.gridRowStart = String(placement.rowStart);
                item.style.gridRowEnd = `span ${placement.rowSpan}`;
            });
            setMeasured(true);
        };
        const scheduleLayout = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(layout);
        };

        layout();

        const contentObserver = new ResizeObserver(scheduleLayout);
        items.forEach((item) => {
            const content = item.firstElementChild;
            if (content) contentObserver.observe(content);
        });

        const gridObserver = new ResizeObserver(scheduleLayout);
        gridObserver.observe(grid);
        return () => {
            cancelAnimationFrame(frame);
            contentObserver.disconnect();
            gridObserver.disconnect();
        };
    }, [children]);

    return (
        <div ref={gridRef} className={cn("grid min-w-0 items-start gap-2 sm:gap-3", measured ? "auto-rows-[4px]" : "auto-rows-auto", className)} aria-label={ariaLabel}>
            {Children.map(children, (child) => (
                <div className="min-w-0">
                    <div className="min-w-0">{child}</div>
                </div>
            ))}
        </div>
    );
}
