"use client";

import type { ViewportTransform } from "../types";

export type LeaferViewport = ViewportTransform;

export const MIN_CANVAS_ZOOM = 0.1;
export const MAX_CANVAS_ZOOM = 3.0;
const CANVAS_ZOOM_STEP_FACTOR = 1.25;

export function clampCanvasZoom(scale: number): number {
    const finiteScale = Number.isFinite(scale) ? scale : 1;
    return Math.max(MIN_CANVAS_ZOOM, Math.min(MAX_CANVAS_ZOOM, finiteScale));
}

export function stepCanvasZoom(scale: number, direction: "in" | "out"): number {
    const current = clampCanvasZoom(scale);
    return clampCanvasZoom(direction === "in" ? current * CANVAS_ZOOM_STEP_FACTOR : current / CANVAS_ZOOM_STEP_FACTOR);
}

export function screenToCanvas(clientX: number, clientY: number, containerRect: DOMRect, viewport: LeaferViewport): { x: number; y: number } {
    return {
        x: (clientX - containerRect.left - viewport.x) / viewport.k,
        y: (clientY - containerRect.top - viewport.y) / viewport.k,
    };
}

export function canvasToScreen(canvasX: number, canvasY: number, viewport: LeaferViewport): { x: number; y: number } {
    return {
        x: canvasX * viewport.k + viewport.x,
        y: canvasY * viewport.k + viewport.y,
    };
}

export function centerViewportOnRect(
    rect: { x: number; y: number; width: number; height: number },
    container: { width: number; height: number },
    scale: number,
): LeaferViewport {
    const k = clampCanvasZoom(scale);
    return {
        x: container.width / 2 - (rect.x + rect.width / 2) * k,
        y: container.height / 2 - (rect.y + rect.height / 2) * k,
        k,
    };
}

export function clampViewport(viewport: LeaferViewport, _containerWidth: number, _containerHeight: number): LeaferViewport {
    return {
        x: Number.isFinite(viewport.x) ? viewport.x : 0,
        y: Number.isFinite(viewport.y) ? viewport.y : 0,
        k: clampCanvasZoom(viewport.k),
    };
}

export function viewportToCssTransform(viewport: LeaferViewport): string {
    return `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.k})`;
}

export const VIEWPORT_EPSILON = 0.001;

export function sameViewport(a: LeaferViewport, b: LeaferViewport): boolean {
    return Math.abs(a.x - b.x) < VIEWPORT_EPSILON && Math.abs(a.y - b.y) < VIEWPORT_EPSILON && Math.abs(a.k - b.k) < VIEWPORT_EPSILON;
}
