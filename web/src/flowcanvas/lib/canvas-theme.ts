export type CanvasColorTheme = "light" | "dark";
export type CanvasBackgroundMode = "dots" | "lines" | "blank";

export const canvasThemes = {
    light: {
        canvas: {
            background: "#f2f3f5",
            dot: "rgba(60,60,67,.20)",
            line: "rgba(60,60,67,.09)",
            selectionStroke: "#0891b2",
            selectionFill: "rgba(8,145,178,.10)",
        },
        node: {
            label: "#3a3a3c",
            fill: "#f7f7f8",
            panel: "rgba(255,255,255,.94)",
            stroke: "rgba(60,60,67,.18)",
            activeStroke: "#0891b2",
            placeholder: "#8e8e93",
            text: "#1d1d1f",
            muted: "#636366",
            faint: "#aeaeb2",
        },
        toolbar: {
            panel: "rgba(250,250,252,.82)",
            border: "rgba(60,60,67,.16)",
            item: "#48484a",
            itemHover: "rgba(118,118,128,.12)",
            activeBg: "rgba(8,145,178,.14)",
            activeText: "#0e7490",
        },
        ui: {
            material: "rgba(250,250,252,.78)",
            materialElevated: "rgba(255,255,255,.94)",
            hairline: "rgba(60,60,67,.16)",
            shadow: "0 18px 50px rgba(0,0,0,.14), 0 2px 8px rgba(0,0,0,.06)",
            accent: "#0891b2",
            accentSoft: "rgba(8,145,178,.14)",
            controlFill: "rgba(118,118,128,.12)",
            danger: "#ff3b30",
        },
        connection: {
            color: "rgba(71,85,105,.58)",
            activeColor: "#078AD1",
            width: 2.4,
            activeWidth: 3.1,
            tempWidth: 2.6,
            dash: [84, 240] as const,
        },
    },
    dark: {
        canvas: {
            // LibTV 实测：画布底 #141414，面板 #262626，节点/表格行 #171717
            background: "#141414",
            dot: "rgba(255,255,255,.10)",
            line: "rgba(255,255,255,.025)",
            selectionStroke: "#09CAF5",
            selectionFill: "rgba(9,202,245,.12)",
        },
        node: {
            label: "#CECECE",
            fill: "#171717",
            panel: "rgba(23,23,23,.96)",
            stroke: "rgba(255,255,255,.08)",
            activeStroke: "#09CAF5",
            placeholder: "#737373",
            text: "#FFFFFF",
            muted: "#8F8F8F",
            faint: "#5C5C5C",
        },
        toolbar: {
            panel: "rgba(38,38,38,.80)",
            border: "rgba(255,255,255,.08)",
            item: "#A3A3A3",
            itemHover: "rgba(255,255,255,.08)",
            activeBg: "rgba(9,202,245,.16)",
            activeText: "#09CAF5",
        },
        ui: {
            material: "rgba(38,38,38,.74)",
            materialElevated: "rgba(38,38,38,.94)",
            hairline: "rgba(255,255,255,.08)",
            shadow: "0 20px 56px rgba(0,0,0,.42), 0 2px 10px rgba(0,0,0,.24)",
            accent: "#09CAF5",
            accentSoft: "rgba(9,202,245,.16)",
            controlFill: "rgba(255,255,255,.08)",
            danger: "#F06B6B",
        },
        connection: {
            color: "rgba(206,206,206,.72)",
            activeColor: "#09CAF5",
            width: 2.4,
            activeWidth: 3.1,
            tempWidth: 2.6,
            dash: [84, 240] as const,
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
