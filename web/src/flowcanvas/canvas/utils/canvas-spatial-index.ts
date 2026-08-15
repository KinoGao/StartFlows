export type CanvasSpatialRect = {
    left: number;
    top: number;
    right: number;
    bottom: number;
};

export type CanvasSpatialEntry<T> = {
    item: T;
    rect: CanvasSpatialRect;
    index: number;
};

export type CanvasSpatialIndex<T> = {
    cellSize: number;
    cells: Map<string, CanvasSpatialEntry<T>[]>;
};

export function buildSpatialIndex<T>(items: T[], getRect: (item: T, index: number) => CanvasSpatialRect, options?: { cellSize?: number }) {
    const cellSize = options?.cellSize || 512;
    const cells = new Map<string, CanvasSpatialEntry<T>[]>();
    items.forEach((item, index) => {
        const rect = normalizeRect(getRect(item, index));
        const entry = { item, rect, index };
        forEachCell(rect, cellSize, (key) => {
            const entries = cells.get(key);
            if (entries) entries.push(entry);
            else cells.set(key, [entry]);
        });
    });
    return { cellSize, cells };
}

export function querySpatialIndex<T>(index: CanvasSpatialIndex<T>, rect: CanvasSpatialRect) {
    const normalized = normalizeRect(rect);
    const seen = new Set<CanvasSpatialEntry<T>>();
    const result: CanvasSpatialEntry<T>[] = [];
    forEachCell(normalized, index.cellSize, (key) => {
        index.cells.get(key)?.forEach((entry) => {
            if (seen.has(entry) || !rectsIntersect(entry.rect, normalized)) return;
            seen.add(entry);
            result.push(entry);
        });
    });
    return result.sort((left, right) => left.index - right.index);
}

export function rectsIntersect(left: CanvasSpatialRect, right: CanvasSpatialRect) {
    return left.left < right.right && left.right > right.left && left.top < right.bottom && left.bottom > right.top;
}

function normalizeRect(rect: CanvasSpatialRect): CanvasSpatialRect {
    return {
        left: Math.min(rect.left, rect.right),
        top: Math.min(rect.top, rect.bottom),
        right: Math.max(rect.left, rect.right),
        bottom: Math.max(rect.top, rect.bottom),
    };
}

function forEachCell(rect: CanvasSpatialRect, cellSize: number, visit: (key: string) => void) {
    const minX = Math.floor(rect.left / cellSize);
    const maxX = Math.floor(rect.right / cellSize);
    const minY = Math.floor(rect.top / cellSize);
    const maxY = Math.floor(rect.bottom / cellSize);
    for (let x = minX; x <= maxX; x += 1) {
        for (let y = minY; y <= maxY; y += 1) {
            visit(`${x}:${y}`);
        }
    }
}
