"use client";

import { type ReactNode, useEffect } from "react";
import { ConfigProvider } from "antd";

import { useImageModelCapability } from "@/flowcanvas/hooks/use-image-model-capability";
import { type CanvasTheme } from "@/flowcanvas/lib/canvas-theme";
import { isSeedreamImageModel, seedreamCapabilitiesForModel } from "@/flowcanvas/lib/seedream-image";
import type { ImageModelCapability } from "@/flowcanvas/services/api/model-capabilities";
import type { AiConfig } from "@/flowcanvas/stores/use-config-store";

const qualityOptions = [
    { value: "low", label: "低画质" },
    { value: "medium", label: "标准画质" },
    { value: "high", label: "高画质" },
];
const resolutionOptions = [
    { value: "1k", label: "1K" },
    { value: "2k", label: "2K" },
    { value: "4k", label: "4K" },
];
const LIBTV_OUTPUT_COUNTS = [1, 2, 4];

const aspectOptions = [
    { value: "1:1", label: "1:1", width: 1024, height: 1024, icon: "square" },
    { value: "1:2", label: "1:2", width: 768, height: 1536, icon: "portrait" },
    { value: "2:1", label: "2:1", width: 1536, height: 768, icon: "landscape" },
    { value: "9:16", label: "9:16", width: 1024, height: 1824, icon: "portrait" },
    { value: "16:9", label: "16:9", width: 1824, height: 1024, icon: "landscape" },
    { value: "3:4", label: "3:4", width: 1024, height: 1360, icon: "portrait" },
    { value: "4:3", label: "4:3", width: 1360, height: 1024, icon: "landscape" },
    { value: "3:2", label: "3:2", width: 1536, height: 1024, icon: "landscape" },
    { value: "2:3", label: "2:3", width: 1024, height: 1536, icon: "portrait" },
    { value: "5:4", label: "5:4", width: 1280, height: 1024, icon: "landscape" },
    { value: "4:5", label: "4:5", width: 1024, height: 1280, icon: "portrait" },
    { value: "21:9", label: "21:9", width: 1792, height: 768, icon: "landscape" },
    { value: "9:21", label: "9:21", width: 768, height: 1792, icon: "portrait" },
];

type ImageSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: "quality" | "resolution" | "size" | "count", value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
    maxCount?: number;
    referenceCount?: number;
    variant?: "default" | "composer";
};

export function ImageSettingsPanel({ config, onConfigChange, theme, showTitle = true, className = "w-[376px] space-y-4 rounded-2xl px-1 py-0.5", maxCount = 15, referenceCount = 0, variant = "default" }: ImageSettingsPanelProps) {
    const quality = normalizeImageQuality(config.quality);
    const resolution = normalizeImageResolution(config.resolution);
    const model = config.model || config.imageModel;
    const { capability: imageCapability } = useImageModelCapability(model);
    const seedream = isSeedreamImageModel(model);
    const seedreamCapabilities = seedream ? seedreamCapabilitiesForModel(model) : null;
    const configuredCountLimit = imageCapability?.counts.length ? Math.max(...imageCapability.counts) : 0;
    const totalOutputLimit = imageCapability?.maxTotalImages ? Math.max(1, imageCapability.maxTotalImages - Math.max(0, referenceCount)) : 0;
    const effectiveMaxCount = smallestPositive(maxCount, imageCapability?.maxOutputs || 0, configuredCountLimit, totalOutputLimit) || maxCount;
    const allowedCounts = imageCapability?.counts.filter((value) => value <= effectiveMaxCount) || [];
    const quickCounts = preferredImageCounts(allowedCounts, effectiveMaxCount);
    const rawCount = Math.max(1, Math.min(effectiveMaxCount, Math.floor(Math.abs(Number(config.count)) || 1)));
    const count = nearestAllowedCount(rawCount, quickCounts, effectiveMaxCount);
    const availableQualities = qualityOptions.filter((item) => !imageQualityDisabled(item.value, imageCapability));
    const selectedQuality = availableQualities.find((item) => item.value === quality) || availableQualities.find((item) => item.value === "medium") || availableQualities[0] || qualityOptions[1];
    const availableResolutions = resolutionOptions.filter((item) => !imageResolutionDisabled(item.value, imageCapability, seedreamCapabilities));
    const selectedResolution = availableResolutions.find((item) => item.value === resolution) || availableResolutions.find((item) => item.value === "2k") || availableResolutions[0] || resolutionOptions[1];
    const availableAspects = aspectOptions.filter((item) => !imageSizeDisabled(item.value, imageCapability));
    const selectedAspect = availableAspects.find((item) => item.value === config.size) || availableAspects.find((item) => item.value === "16:9") || availableAspects[0] || aspectOptions[0];

    useEffect(() => {
        if (rawCount !== count) onConfigChange("count", String(count));
    }, [count, onConfigChange, rawCount]);

    useEffect(() => {
        if (quality !== selectedQuality.value) onConfigChange("quality", selectedQuality.value);
    }, [onConfigChange, quality, selectedQuality.value]);

    useEffect(() => {
        if (resolution !== selectedResolution.value) onConfigChange("resolution", selectedResolution.value);
    }, [onConfigChange, resolution, selectedResolution.value]);

    useEffect(() => {
        if (config.size !== selectedAspect.value) onConfigChange("size", selectedAspect.value);
    }, [config.size, onConfigChange, selectedAspect.value]);

    return (
        <ImageSettingsTheme theme={theme}>
            <div
                className={className}
                style={{ color: theme.node.text }}
                onMouseDown={(event) => event.stopPropagation()}
                onWheelCapture={(event) => event.stopPropagation()}
                onWheel={(event) => event.stopPropagation()}
            >
                {showTitle ? <div className="text-lg font-semibold">图像设置</div> : null}
                <div className="space-y-2.5">
                    <SettingTitle color={theme.node.muted}>画质</SettingTitle>
                    <div className="grid grid-cols-3 gap-2.5">
                        {qualityOptions.map((item) => (
                            <OptionPill key={item.value} selected={selectedQuality.value === item.value} disabled={imageQualityDisabled(item.value, imageCapability)} theme={theme} onClick={() => onConfigChange("quality", item.value)}>
                                {item.label}
                            </OptionPill>
                        ))}
                    </div>
                </div>
                <div className="space-y-2.5">
                    <SettingTitle color={theme.node.muted}>清晰度</SettingTitle>
                    <div className="grid grid-cols-3 gap-2.5">
                        {resolutionOptions.map((item) => (
                            <OptionPill key={item.value} selected={selectedResolution.value === item.value} disabled={imageResolutionDisabled(item.value, imageCapability, seedreamCapabilities)} theme={theme} onClick={() => onConfigChange("resolution", item.value)}>
                                {item.label}
                            </OptionPill>
                        ))}
                    </div>
                </div>
                <div className="space-y-2.5">
                    <SettingTitle color={theme.node.muted}>比例</SettingTitle>
                    <div className={`grid ${variant === "composer" ? "grid-cols-4" : "grid-cols-5"} gap-2.5`}>
                        {aspectOptions.map((item) => {
                            const disabled = imageSizeDisabled(item.value, imageCapability);
                            return (
                                <button
                                    key={item.value}
                                    type="button"
                                    disabled={disabled}
                                    className={`flex ${variant === "composer" ? "h-14" : "h-16"} cursor-pointer flex-col items-center justify-center gap-1 rounded-[8px] border bg-transparent text-xs transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-45`}
                                    style={{ borderColor: selectedAspect.value === item.value ? theme.node.text : theme.node.stroke, color: theme.node.text }}
                                    onMouseDown={(event) => event.stopPropagation()}
                                    onClick={() => onConfigChange("size", item.value)}
                                >
                                    <AspectIcon type={item.icon} width={item.width} height={item.height} color={theme.node.text} />
                                    <span>{item.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="space-y-2.5">
                    <SettingTitle color={theme.node.muted}>生成数量</SettingTitle>
                    <div className="grid grid-cols-3 gap-2.5">
                        {quickCounts.map((value) => (
                            <OptionPill key={value} selected={count === value} theme={theme} onClick={() => onConfigChange("count", String(value))} className="rounded-[10px]">
                                {value} 张
                            </OptionPill>
                        ))}
                        {quickCounts.length < 3 ? <CountInput value={count} max={effectiveMaxCount} theme={theme} onChange={(value) => onConfigChange("count", String(nearestAllowedCount(value || 1, quickCounts, effectiveMaxCount)))} /> : null}
                    </div>
                </div>
            </div>
        </ImageSettingsTheme>
    );
}

export function ImageSettingsTheme({ theme, children }: { theme: CanvasTheme; children: ReactNode }) {
    return (
        <ConfigProvider
            theme={{
                token: { colorBgContainer: theme.toolbar.panel, colorBgElevated: theme.toolbar.panel, colorBorder: theme.node.stroke, colorPrimary: theme.node.activeStroke, colorText: theme.node.text, colorTextLightSolid: theme.node.panel },
                components: { Button: { defaultBg: theme.toolbar.panel, defaultBorderColor: theme.node.stroke, defaultColor: theme.node.text } },
            }}
        >
            {children}
        </ConfigProvider>
    );
}

export function imageQualityLabel(value: string) {
    return ({ low: "低画质", medium: "标准画质", high: "高画质" } as Record<string, string>)[normalizeImageQuality(value)] || "标准画质";
}

export function imageResolutionLabel(value: string) {
    return normalizeImageResolution(value).toUpperCase();
}

export function imageSizeLabel(size: string) {
    return aspectOptions.find((item) => item.value === size)?.label || "16:9";
}

function normalizeImageQuality(value: string | undefined) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "low" || normalized === "medium" || normalized === "high") return normalized;
    if (normalized === "standard") return "medium";
    return "medium";
}

function normalizeImageResolution(value: string | undefined) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized === "1k" || normalized === "4k" ? normalized : "2k";
}

function OptionPill({ selected, disabled, theme, onClick, children, className = "" }: { selected: boolean; disabled?: boolean; theme: CanvasTheme; onClick: () => void; children: ReactNode; className?: string }) {
    return (
        <button
            type="button"
            disabled={disabled}
            className={`h-9 cursor-pointer rounded-full border px-2 text-sm transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
            style={{ background: "transparent", borderColor: selected ? theme.node.text : theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function imageQualityDisabled(value: string, capability: ImageModelCapability | null) {
    if (!capability?.qualities.length) return false;
    const accepted = capability.qualities.map((item) => item.toLowerCase());
    const aliases = value === "medium" ? ["medium", "standard"] : [value];
    return !aliases.some((item) => accepted.includes(item));
}

function imageResolutionDisabled(value: string, capability: ImageModelCapability | null, fallback: ReturnType<typeof seedreamCapabilitiesForModel> | null) {
    if (capability?.resolutions.length) return !capability.resolutions.some((item) => item.toLowerCase() === value);
    if (!fallback) return false;
    return !fallback.resolutions.some((item) => item.toLowerCase() === value);
}

function imageSizeDisabled(value: string, capability: ImageModelCapability | null) {
    if (capability?.ratios.length) return !capability.ratios.some((item) => item.toLowerCase() === value.toLowerCase());
    return false;
}

function smallestPositive(...values: number[]) {
    const positive = values.filter((value) => Number.isFinite(value) && value > 0);
    return positive.length ? Math.min(...positive) : 0;
}

function preferredImageCounts(allowed: number[], max: number) {
    const configured = allowed.length ? allowed : LIBTV_OUTPUT_COUNTS.filter((value) => value <= max);
    const preferred = configured.filter((value) => LIBTV_OUTPUT_COUNTS.includes(value));
    return (preferred.length ? preferred : configured).slice(0, 4);
}

function nearestAllowedCount(value: number, allowed: number[], max: number) {
    const normalized = Math.max(1, Math.min(max, Math.floor(Math.abs(value) || 1)));
    if (!allowed.length || allowed.includes(normalized)) return normalized;
    return allowed.reduce((best, current) => Math.abs(current - normalized) < Math.abs(best - normalized) ? current : best, allowed[0]);
}

function CountInput({ value, max, theme, onChange }: { value: number; max: number; theme: CanvasTheme; onChange: (value: number | null) => void }) {
    return (
        <label className="flex h-9 w-full overflow-hidden rounded-[10px] border text-sm" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
            <input
                type="number"
                min={1}
                max={max}
                className="min-w-0 flex-1 bg-transparent px-3 text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                style={{ color: theme.node.text, WebkitTextFillColor: theme.node.text }}
                value={value || ""}
                onChange={(event) => onChange(Number(event.target.value) || null)}
                onMouseDown={(event) => event.stopPropagation()}
            />
        </label>
    );
}

function AspectIcon({ type, width, height, color }: { type: string; width: number; height: number; color: string }) {
    const ratio = width / Math.max(1, height);
    const boxWidth = ratio >= 1 ? 24 : Math.max(10, 24 * ratio);
    const boxHeight = ratio >= 1 ? Math.max(10, 24 / ratio) : 24;
    return (
        <span className="grid h-7 w-9 place-items-center">
            <span className="border-2" style={{ width: boxWidth, height: boxHeight, borderColor: color }} />
        </span>
    );
}

function SettingTitle({ children, color }: { children: string; color: string }) {
    return <div className="text-xs font-medium" style={{ color }}>{children}</div>;
}
