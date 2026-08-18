/** 分镜帧拼接导出：把多张分镜图按宫格拼成一张整图。布局纯函数可测，绘制在浏览器执行。 */

export type StitchLayout = { cols: number; rows: number; width: number; height: number; cellWidth: number; cellHeight: number; gap: number };

/** 宫格布局：列数取 ceil(sqrt(n))（至少 1），按首个单元格宽高比等比排列。 */
export function computeStitchLayout(count: number, cellWidth: number, cellHeight: number, gap = 12, padding = 24): StitchLayout {
    const safeCount = Math.max(1, count);
    const cols = Math.ceil(Math.sqrt(safeCount));
    const rows = Math.ceil(safeCount / cols);
    return {
        cols,
        rows,
        cellWidth,
        cellHeight,
        gap,
        width: padding * 2 + cols * cellWidth + (cols - 1) * gap,
        height: padding * 2 + rows * cellHeight + (rows - 1) * gap,
    };
}

export type StitchImageInput = { url: string; title: string };

/** 浏览器端拼接：逐张加载图片绘制到离屏 canvas，返回 PNG Blob。加载失败的图跳过。 */
export async function stitchImagesToBlob(images: StitchImageInput[], gap = 12, padding = 24): Promise<Blob> {
    const loaded = (
        await Promise.all(
            images.map(
                (image) =>
                    new Promise<{ url: string; title: string; element: HTMLImageElement } | null>((resolve) => {
                        const element = new Image();
                        element.onload = () => resolve({ ...image, element });
                        element.onerror = () => resolve(null);
                        element.src = image.url;
                    }),
            ),
        )
    ).filter((item): item is { url: string; title: string; element: HTMLImageElement } => Boolean(item && item.element.naturalWidth));
    if (!loaded.length) throw new Error("没有可拼接的分镜图");
    const first = loaded[0].element;
    const cellHeight = 360;
    const cellWidth = Math.round((first.naturalWidth / first.naturalHeight) * cellHeight) || 640;
    const layout = computeStitchLayout(loaded.length, cellWidth, cellHeight, gap, padding);
    const canvas = document.createElement("canvas");
    canvas.width = layout.width;
    canvas.height = layout.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前浏览器不支持拼接导出");
    context.fillStyle = "#0b0d12";
    context.fillRect(0, 0, layout.width, layout.height);
    loaded.forEach((image, index) => {
        const col = index % layout.cols;
        const row = Math.floor(index / layout.cols);
        const x = padding + col * (cellWidth + gap);
        const y = padding + row * (cellHeight + gap);
        // 等比 contain 进单元格
        const scale = Math.min(cellWidth / image.element.naturalWidth, cellHeight / image.element.naturalHeight);
        const width = image.element.naturalWidth * scale;
        const height = image.element.naturalHeight * scale;
        context.drawImage(image.element, x + (cellWidth - width) / 2, y + (cellHeight - height) / 2, width, height);
        context.fillStyle = "rgba(255,255,255,0.72)";
        context.font = "14px sans-serif";
        context.fillText(`${index + 1}. ${image.title}`.slice(0, 32), x + 4, y + 20);
    });
    return new Promise((resolve, reject) => {
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("拼接导出失败"))), "image/png");
    });
}
