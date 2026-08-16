/**
 * FlowCanvas 主题统一并入 VOZEB 主题 store（单主题系统，画布跟随全局明暗切换）。
 * 接口与 FlowCanvas 原 store 一致（theme/setTheme）。
 */
export { useThemeStore } from "@/stores/use-theme-store";
export type ThemeName = "light" | "dark";
