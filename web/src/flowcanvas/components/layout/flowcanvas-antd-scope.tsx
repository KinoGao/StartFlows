"use client";

import type { ReactNode } from "react";
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";

import { getAntThemeConfig } from "@/flowcanvas/lib/app-theme";
import { useThemeStore } from "@/flowcanvas/stores/use-theme-store";

/**
 * FlowCanvas 组件树的 antd 主题作用域：VOZEB 全局 antd 是亮色主题，
 * 画布工作台是深色面板（canvasThemes），antd 组件需要按画布主题切换配色，
 * 否则深底上出现深色文字/描边的隐形按钮。
 */
export function FlowcanvasAntdScope({ children }: { children: ReactNode }) {
    const theme = useThemeStore((state) => state.theme);
    return <ConfigProvider locale={zhCN} theme={getAntThemeConfig(theme === "dark")}>{children}</ConfigProvider>;
}
