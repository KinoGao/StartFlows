/** 整理画布：把节点按阅读顺序重排为宫格布局。纯函数，返回 id → 新位置（左上角）。 */

export type TidyLayoutNode = { id: string; position: { x: number; y: number }; width: number; height: number };

const ROW_TOLERANCE = 48;

export function computeTidyLayout(nodes: TidyLayoutNode[], gapX = 96, gapY = 96): Map<string, { x: number; y: number }> {
    const result = new Map<string, { x: number; y: number }>();
    if (!nodes.length) return result;
    // 阅读顺序：同一行带（y 差在容差内）内按 x 排，行带之间按 y 排
    const sorted = [...nodes].sort((a, b) => (Math.abs(a.position.y - b.position.y) <= ROW_TOLERANCE ? a.position.x - b.position.x : a.position.y - b.position.y));
    const originX = Math.min(...sorted.map((node) => node.position.x));
    const originY = Math.min(...sorted.map((node) => node.position.y));
    const cols = Math.max(1, Math.ceil(Math.sqrt(sorted.length)));
    const cellWidth = Math.max(...sorted.map((node) => node.width)) + gapX;
    let y = originY;
    for (let row = 0; row * cols < sorted.length; row += 1) {
        const rowNodes = sorted.slice(row * cols, (row + 1) * cols);
        const rowHeight = Math.max(...rowNodes.map((node) => node.height));
        rowNodes.forEach((node, col) => result.set(node.id, { x: originX + col * cellWidth, y }));
        y += rowHeight + gapY;
    }
    return result;
}
