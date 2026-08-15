/**
 * Pin 颜色标记工具（TapNow 交互范式）：节点右上角色点。
 * 纯函数模块，零 React / DOM 依赖，可直接被 node --test 运行。
 *
 * 色板为业务标记色（用户显式选择的节点标记），非 UI 主题 token；
 * 界面骨架色仍走 canvasThemes，此处仅承载可持久化的标记数据。
 */

export type PinColorId = "red" | "orange" | "yellow" | "green" | "blue" | "purple" | "gray";

export type PinColorDef = { id: PinColorId; color: string; label: string };

/** TapNow 风格 Pin 色板。 */
export const PIN_COLORS: readonly PinColorDef[] = [
    { id: "red", color: "#ff5f57", label: "红" },
    { id: "orange", color: "#ff9f0a", label: "橙" },
    { id: "yellow", color: "#ffd60a", label: "黄" },
    { id: "green", color: "#30d158", label: "绿" },
    { id: "blue", color: "#0a84ff", label: "蓝" },
    { id: "purple", color: "#bf5af2", label: "紫" },
    { id: "gray", color: "#8e8e93", label: "灰" },
];

const PIN_COLOR_IDS = new Set<string>(PIN_COLORS.map((def) => def.id));

/** 校验值是否为色板内合法 id。 */
export function isValidPinColor(value: string | undefined): value is PinColorId {
    return typeof value === "string" && PIN_COLOR_IDS.has(value);
}

/** 可携带 pinColor 的对象形状（鸭子类型，避免强依赖 CanvasNodeData）。 */
export type PinColorHolder = { pinColor?: string };

/** 读取节点的 Pin 颜色 id；缺失或非法返回 undefined。 */
export function getPinColor(node: PinColorHolder): PinColorId | undefined {
    return isValidPinColor(node.pinColor) ? node.pinColor : undefined;
}

/** id → 色值（hex）；未知 id 返回 undefined。 */
export function getPinColorValue(pinColor: string | undefined): string | undefined {
    return PIN_COLORS.find((def) => def.id === pinColor)?.color;
}

/** id → 中文标签；未知 id 返回 undefined。 */
export function getPinColorLabel(pinColor: string | undefined): string | undefined {
    return PIN_COLORS.find((def) => def.id === pinColor)?.label;
}

/** 写入节点 Pin 颜色（不可变，返回新副本）；非法值原样返回。 */
export function setPinColor(node: PinColorHolder, color: string | undefined): PinColorHolder {
    if (!isValidPinColor(color)) return node;
    return { ...node, pinColor: color };
}
