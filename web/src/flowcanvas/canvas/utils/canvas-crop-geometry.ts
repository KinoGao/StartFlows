/**
 * 裁剪框几何计算（归一化坐标 0-1）：
 * - 拖动手柄时固定对边（e 手柄保持左边缘、w 手柄保持右边缘），越界时限制尺寸而不是移动位置；
 * - 锁定比例时保持拖动前的像素宽高比（box 为图片显示容器尺寸，宽高比与原图一致）。
 */

export type CanvasCropRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type CropResizeHandle = "n" | "e" | "s" | "w" | "ne" | "nw" | "se" | "sw";

export const MIN_CROP_SIZE = 0.06;

function clamp(value: number, min: number, max: number) {
    return Math.min(max, Math.max(min, value));
}

/** 平移裁剪框：不越出画布边界。 */
export function moveCrop(crop: CanvasCropRect, dx: number, dy: number): CanvasCropRect {
    return {
        ...crop,
        x: clamp(crop.x + dx, 0, 1 - crop.width),
        y: clamp(crop.y + dy, 0, 1 - crop.height),
    };
}

/**
 * 拖动手柄调整裁剪框。
 * @param crop 拖动前的裁剪框
 * @param dx / @param dy 指针位移（相对容器宽高的归一化增量）
 * @param handle 拖动的方向手柄
 * @param locked 是否锁定宽高比
 * @param box 图片显示容器尺寸（用于像素宽高比换算）
 */
export function resizeCrop(crop: CanvasCropRect, dx: number, dy: number, handle: CropResizeHandle, locked: boolean, box: { width: number; height: number }): CanvasCropRect {
    let x = crop.x;
    let y = crop.y;
    let width = crop.width;
    let height = crop.height;

    if (handle.includes("e")) width = crop.width + dx;
    if (handle.includes("s")) height = crop.height + dy;
    if (handle.includes("w")) {
        x = crop.x + dx;
        width = crop.width - dx;
    }
    if (handle.includes("n")) {
        y = crop.y + dy;
        height = crop.height - dy;
    }

    // 边界上限：固定对边（e 保持左边缘、w 保持右边缘、s 保持上边缘、n 保持下边缘）
    const maxWidth = handle.includes("w") ? crop.x + crop.width : 1 - crop.x;
    const maxHeight = handle.includes("n") ? crop.y + crop.height : 1 - crop.y;

    if (locked) {
        // 像素宽高比（拖动前）：box 宽高比与原图一致（img 等比缩放）
        const aspect = (crop.width * box.width) / (crop.height * box.height);
        const horizontal = handle.includes("e") || handle.includes("w");
        if (horizontal) {
            // 以宽度为主导，高度按比例跟随；超界时收缩回边界内并保持比例
            width = clamp(width, MIN_CROP_SIZE, maxWidth);
            height = (width * box.width) / (aspect * box.height);
            if (height > maxHeight) {
                height = maxHeight;
                width = (height * aspect * box.height) / box.width;
            }
            height = clamp(height, MIN_CROP_SIZE, maxHeight);
            width = (height * aspect * box.height) / box.width;
        } else {
            height = clamp(height, MIN_CROP_SIZE, maxHeight);
            width = (height * aspect * box.height) / box.width;
            if (width > maxWidth) {
                width = maxWidth;
                height = (width * box.width) / (aspect * box.height);
            }
            width = clamp(width, MIN_CROP_SIZE, maxWidth);
            height = (width * box.width) / (aspect * box.height);
        }
    } else {
        width = clamp(width, MIN_CROP_SIZE, maxWidth);
        height = clamp(height, MIN_CROP_SIZE, maxHeight);
    }

    // 固定对边位置（w/n 手柄时右/下边缘不动）
    if (handle.includes("w")) x = crop.x + crop.width - width;
    if (handle.includes("n")) y = crop.y + crop.height - height;

    return { x, y, width, height };
}
