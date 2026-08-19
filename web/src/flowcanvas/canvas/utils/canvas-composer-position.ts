export function resolveComposerOverlayPosition({
    rawLeft,
    nodeBottom,
    composerHeight,
    canvasHeight,
    canvasWidth = 0,
    panelWidth = 0,
}: {
    rawLeft: number;
    nodeBottom: number;
    composerHeight: number;
    canvasHeight: number;
    canvasWidth?: number;
    panelWidth?: number;
}) {
    const edge = 12;
    const gap = 12;
    const safeHeight = Math.max(1, canvasHeight);
    const minPanelHeight = Math.min(180, Math.max(120, safeHeight - edge * 2));
    const maxPanelHeight = Math.max(minPanelHeight, safeHeight - edge * 2);
    const panelHeight = Math.min(Math.max(minPanelHeight, composerHeight), maxPanelHeight);
    const top = nodeBottom + gap;
    const availableHeight = safeHeight - top - edge;

    // 面板以节点中心为水平锚点（translateX(-50%)），但必须整体留在视口内：
    // 靠边节点把中心钳制在 [edge + 半宽, 画布宽 - edge - 半宽]，避免左/右缘出屏。
    let left = rawLeft;
    const safeWidth = Math.max(0, canvasWidth);
    if (safeWidth > 0 && panelWidth > 0) {
        const half = panelWidth / 2;
        const minCenter = edge + half;
        const maxCenter = Math.max(minCenter, safeWidth - edge - half);
        left = Math.min(Math.max(rawLeft, minCenter), maxCenter);
    }

    return {
        left,
        top,
        maxHeight: Math.min(panelHeight, Math.max(minPanelHeight, availableHeight)),
    };
}
