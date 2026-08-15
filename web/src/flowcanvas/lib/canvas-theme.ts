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
            background: "#0A0B0D",
            dot: "rgba(255,255,255,.10)",
            line: "rgba(255,255,255,.025)",
            selectionStroke: "#12C4EE",
            selectionFill: "rgba(18,196,238,.12)",
        },
        node: {
            label: "#C9CFD6",
            fill: "#17191C",
            panel: "rgba(23,25,28,.96)",
            stroke: "rgba(255,255,255,.10)",
            activeStroke: "#12C4EE",
            placeholder: "#8e8e93",
            text: "#F4F6F8",
            muted: "#9BA3AD",
            faint: "#636366",
        },
        toolbar: {
            panel: "rgba(23,25,28,.80)",
            border: "rgba(255,255,255,.10)",
            item: "#9BA3AD",
            itemHover: "rgba(255,255,255,.10)",
            activeBg: "rgba(18,196,238,.16)",
            activeText: "#12C4EE",
        },
        ui: {
            material: "rgba(23,25,28,.74)",
            materialElevated: "rgba(35,38,42,.94)",
            hairline: "rgba(255,255,255,.10)",
            shadow: "0 20px 56px rgba(0,0,0,.42), 0 2px 10px rgba(0,0,0,.24)",
            accent: "#12C4EE",
            accentSoft: "rgba(18,196,238,.16)",
            controlFill: "rgba(255,255,255,.10)",
            danger: "#F06B6B",
        },
        connection: {
            color: "rgba(208,218,229,.78)",
            activeColor: "#43B4FF",
            width: 2.4,
            activeWidth: 3.1,
            tempWidth: 2.6,
            dash: [84, 240] as const,
        },
    },
} as const;

export type CanvasTheme = (typeof canvasThemes)[CanvasColorTheme];
