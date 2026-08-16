import type { ThemeConfig } from "antd";
import { theme as antdTheme } from "antd";

const neutral = {
    light: {
        primary: "#171717",
        primaryHover: "#000000",
        primaryText: "#ffffff",
        menuBg: "#f5f5f5",
        menuText: "#171717",
        selectActiveBg: "#f5f5f5",
        selectSelectedBg: "#f0f0f0",
        selectText: "#171717",
        tableSelectedBg: "rgba(17, 17, 17, 0.05)",
        tableSelectedHoverBg: "rgba(17, 17, 17, 0.08)",
    },
    dark: {
        primary: "#fafafa",
        primaryHover: "#ffffff",
        primaryText: "#171717",
        menuBg: "#262626",
        menuText: "#fafafa",
        selectActiveBg: "#262626",
        selectSelectedBg: "#333333",
        selectText: "#fafafa",
        tableSelectedBg: "rgba(255, 255, 255, 0.08)",
        tableSelectedHoverBg: "rgba(255, 255, 255, 0.12)",
    },
};

export function getAntThemeConfig(dark: boolean): ThemeConfig {
    const color = dark ? neutral.dark : neutral.light;

    return {
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        cssVar: { key: dark ? "infinite-canvas-dark" : "infinite-canvas-light" },
        token: {
            colorPrimary: color.primary,
            colorInfo: color.primary,
            colorLink: color.primary,
            colorLinkHover: color.primaryHover,
            colorLinkActive: color.primary,
            colorTextLightSolid: color.primaryText,
            // VOZEB 外层 ConfigProvider 显式注入了亮色 colorText，嵌套作用域必须显式覆盖
            colorText: dark ? "#fafafa" : "#171717",
            colorTextSecondary: dark ? "rgba(255, 255, 255, 0.65)" : "rgba(0, 0, 0, 0.65)",
            colorTextTertiary: dark ? "rgba(255, 255, 255, 0.45)" : "rgba(0, 0, 0, 0.45)",
            borderRadius: 8,
            controlHeight: 32,
            colorBorder: dark ? "rgba(255, 255, 255, 0.14)" : "rgba(0, 0, 0, 0.12)",
            colorBorderSecondary: dark ? "rgba(255, 255, 255, 0.09)" : "rgba(0, 0, 0, 0.08)",
            colorBgContainer: dark ? "#1f1f1f" : "#ffffff",
            colorBgElevated: dark ? "#262626" : "#ffffff",
            boxShadowSecondary: dark
                ? "0 8px 24px rgba(0, 0, 0, 0.45)"
                : "0 6px 20px rgba(0, 0, 0, 0.08)",
        },
        components: {
            Button: {
                primaryShadow: "none",
            },
            Menu: {
                itemActiveBg: color.menuBg,
                itemHoverBg: color.menuBg,
                itemSelectedBg: color.menuBg,
                itemSelectedColor: color.menuText,
                darkItemHoverBg: neutral.dark.menuBg,
                darkItemSelectedBg: neutral.dark.menuBg,
                darkItemSelectedColor: neutral.dark.menuText,
            },
            Select: {
                optionActiveBg: color.selectActiveBg,
                optionSelectedBg: color.selectSelectedBg,
                optionSelectedColor: color.selectText,
            },
            Table: {
                rowSelectedBg: color.tableSelectedBg,
                rowSelectedHoverBg: color.tableSelectedHoverBg,
            },
        },
    };
}
