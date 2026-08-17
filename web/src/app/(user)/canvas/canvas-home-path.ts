"use client";

import { usePathname } from "next/navigation";

/** 画布列表页路径：智能画布（/smart-canvas）与创作画布（/canvas）共用同一套画布组件，按当前路由区分归属。 */
export function useCanvasHomePath() {
    const pathname = usePathname();
    return pathname?.startsWith("/smart-canvas") ? "/smart-canvas" : "/canvas";
}
