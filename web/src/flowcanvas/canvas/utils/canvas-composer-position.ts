export function resolveComposerOverlayPosition({
    rawLeft,
    nodeBottom,
    composerHeight,
    canvasHeight,
}: {
    rawLeft: number;
    nodeBottom: number;
    composerHeight: number;
    canvasHeight: number;
}) {
    const edge = 12;
    const gap = 12;
    const safeHeight = Math.max(1, canvasHeight);
    const minPanelHeight = Math.min(180, Math.max(120, safeHeight - edge * 2));
    const maxPanelHeight = Math.max(minPanelHeight, safeHeight - edge * 2);
    const panelHeight = Math.min(Math.max(minPanelHeight, composerHeight), maxPanelHeight);
    const top = nodeBottom + gap;
    const availableHeight = safeHeight - top - edge;

    return {
        left: rawLeft,
        top,
        maxHeight: Math.min(panelHeight, Math.max(minPanelHeight, availableHeight)),
    };
}
