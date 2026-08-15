import { useEffect, useState } from "react";

export type CreativeComposerPopoverPlacement = "topLeft" | "top" | "topRight" | "bottomLeft" | "bottom" | "bottomRight";

const horizontalViewportOverflow = { adjustX: 1, adjustY: 0 } as const;
const POPOVER_VIEWPORT_GUTTER = 24;

export function resolveCreativeComposerPopoverPlacement(placement: CreativeComposerPopoverPlacement, narrowViewport: boolean): CreativeComposerPopoverPlacement {
    if (!narrowViewport) return placement;
    return placement.startsWith("bottom") ? "bottom" : "top";
}

export function creativeComposerPopoverOverflow(placement: CreativeComposerPopoverPlacement) {
    return placement === "top" || placement === "bottom" ? horizontalViewportOverflow : false;
}

export function creativeComposerPopoverPanelMaxHeight(placement: CreativeComposerPopoverPlacement, trigger: Pick<DOMRect, "top" | "bottom">, viewport: { top: number; bottom: number }, maximum: number) {
    const available = placement.startsWith("bottom") ? viewport.bottom - trigger.bottom : trigger.top - viewport.top;
    return Math.max(0, Math.min(maximum, Math.floor(available - POPOVER_VIEWPORT_GUTTER)));
}

export function useCreativeComposerPopoverPlacement(placement: CreativeComposerPopoverPlacement) {
    const [narrowViewport, setNarrowViewport] = useState(false);

    useEffect(() => {
        const media = window.matchMedia("(max-width: 640px)");
        const update = () => setNarrowViewport(media.matches);
        update();
        media.addEventListener("change", update);
        return () => media.removeEventListener("change", update);
    }, []);

    return resolveCreativeComposerPopoverPlacement(placement, narrowViewport);
}
