"use client";

import { type ReactNode } from "react";
import { Switch } from "antd";
import { LoaderCircle, TriangleAlert } from "lucide-react";

import { ImageSettingsTheme } from "@/flowcanvas/components/image-settings-panel";
import {
    boolConfig,
    normalizeResolutionToken,
    normalizeSeedanceDuration,
    normalizeSeedanceRatio,
    normalizeSeedanceResolution,
    seedanceCapabilitiesForModel,
    seedanceDurationOptions,
    seedancePixelLabel,
    seedanceRatioOptions,
    seedanceResolutionOptions,
} from "@/flowcanvas/lib/seedance-video";
import { type CanvasTheme } from "@/flowcanvas/lib/canvas-theme";
import { modelOptionName, type AiConfig } from "@/flowcanvas/stores/use-config-store";
import { useVideoModelCapability } from "@/flowcanvas/hooks/use-video-model-capability";
import { videoRatiosForMode, type VideoGenerationMode, type VideoModelCapability } from "@/flowcanvas/services/api/model-capabilities";

const resolutionOptions = [
    { value: "720", label: "720p" },
    { value: "480", label: "480p" },
];

const sizeOptions = [
    { value: "1280x720", label: "横屏", width: 1280, height: 720 },
    { value: "720x1280", label: "竖屏", width: 720, height: 1280 },
    { value: "1024x1024", label: "方形", width: 1024, height: 1024 },
    { value: "1792x1024", label: "宽屏", width: 1792, height: 1024 },
    { value: "1024x1792", label: "长图", width: 1024, height: 1792 },
    { value: "auto", label: "auto", width: 0, height: 0 },
];

const secondOptions = [6, 10, 12, 16, 20];

type VideoSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: "vquality" | "size" | "videoSeconds" | "videoGenerateAudio" | "videoWatermark" | "videoDraft" | "count", value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
    variant?: "default" | "composer";
    generationMode?: VideoGenerationMode;
};

export function VideoSettingsPanel({ config, onConfigChange, theme, showTitle = true, className = "w-[320px] space-y-4 rounded-2xl px-1 py-0.5", variant = "default", generationMode }: VideoSettingsPanelProps) {
    const { capability, isLoading, isFetching } = useVideoModelCapability(config.model || config.videoModel);
    if (capability) {
        return <CapabilityVideoSettingsPanel capability={capability} config={config} onConfigChange={onConfigChange} theme={theme} showTitle={showTitle} className={className} variant={variant} generationMode={generationMode} />;
    }
    return <VideoCapabilityStatus loading={isLoading || isFetching} theme={theme} showTitle={showTitle} className={className} />;
}

function VideoCapabilityStatus({ loading, theme, showTitle, className }: Pick<VideoSettingsPanelProps, "theme" | "showTitle" | "className"> & { loading: boolean }) {
    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">视频设置</div> : null}
                <div className="flex items-start gap-2.5 rounded-xl border px-3 py-3 text-xs leading-5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                    {loading ? <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" /> : <TriangleAlert className="mt-0.5 size-4 shrink-0" />}
                    <span>{loading ? "正在读取当前模型的视频能力，参数暂时锁定。" : "当前模型未配置视频能力，请在后台启用并发布该模型。"}</span>
                </div>
            </div>
        </ImageSettingsTheme>
    );
}

function CapabilityVideoSettingsPanel({ capability, config, onConfigChange, theme, showTitle, className, variant = "default", generationMode }: VideoSettingsPanelProps & { capability: VideoModelCapability }) {
    const ratios = videoRatiosForMode(capability, generationMode);
    const ratio = supportedValue(normalizeSeedanceRatio(config.size), ratios);
    const resolution = supportedValue(normalizeResolutionToken(config.vquality), capability.resolutions);
    const duration = supportedNumber(Number(config.videoSeconds), capability.durations);
    const count = supportedNumber(Number(config.count), capability.counts);
    const generateAudio = boolConfig(config.videoGenerateAudio, true);
    const watermark = boolConfig(config.videoWatermark, false);
    const draft = boolConfig(config.videoDraft, false);
    const compact = variant === "composer";
    const hasOutputControls = capability.generateAudio || capability.watermark || capability.draft || capability.counts.length > 1;
    const ratioControls = ratios.length ? (
        <SettingGroup title="比例" color={theme.node.muted} compact={compact}>
            <div className="grid grid-cols-3 gap-2">
                {ratios.map((value) => (
                    <button key={value} type="button" className={`flex ${compact ? "h-12" : "h-[62px]"} flex-col items-center justify-center gap-1 rounded-lg border text-xs transition hover:opacity-80`} style={{ borderColor: ratio === value ? theme.node.text : theme.node.stroke, background: ratio === value ? theme.node.fill : "transparent", color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onClick={() => onConfigChange("size", value)}>
                        <SizePreview width={ratioPreview(value).width} height={ratioPreview(value).height} color={theme.node.text} />
                        <span>{videoRatioLabel(value)}</span>
                    </button>
                ))}
            </div>
        </SettingGroup>
    ) : null;
    const resolutionControls = capability.resolutions.length ? (
        <SettingGroup title="清晰度" color={theme.node.muted} compact={compact}>
            <div className="grid grid-cols-3 gap-2">
                {capability.resolutions.map((value) => (
                    <OptionPill key={value} selected={resolution === value} disabled={draft && value !== "480p"} theme={theme} compact={compact} onClick={() => onConfigChange("vquality", value)}>{value}</OptionPill>
                ))}
            </div>
        </SettingGroup>
    ) : null;
    const durationControls = capability.durations.length ? (
        <SettingGroup title="视频时长" color={theme.node.muted} compact={compact}>
            <div className={`grid ${compact ? "grid-cols-5" : "grid-cols-4"} gap-2`}>
                {capability.durations.map((value) => (
                    <OptionPill key={value} selected={duration === value} theme={theme} compact={compact} onClick={() => onConfigChange("videoSeconds", String(value))}>{value === -1 ? "智能时长" : `${value}s`}</OptionPill>
                ))}
            </div>
        </SettingGroup>
    ) : null;
    const outputControls = hasOutputControls ? (
        <SettingGroup title="输出" color={theme.node.muted} compact={compact}>
            <div className={`grid ${compact ? "gap-1 px-2 py-1.5" : "gap-2 p-2.5"} rounded-xl border`} style={{ borderColor: theme.node.stroke }}>
                {capability.generateAudio ? <SwitchRow label="生成声音" checked={generateAudio} theme={theme} onChange={(checked) => onConfigChange("videoGenerateAudio", String(checked))} /> : null}
                {capability.watermark ? <SwitchRow label="添加水印" checked={watermark} theme={theme} onChange={(checked) => onConfigChange("videoWatermark", String(checked))} /> : null}
                {capability.draft ? <SwitchRow label="样片模式" checked={draft} theme={theme} onChange={(checked) => { onConfigChange("videoDraft", String(checked)); if (checked) onConfigChange("vquality", "480p"); }} /> : null}
                {capability.counts.length > 1 ? (
                    <div className="grid grid-cols-3 gap-2">
                        {capability.counts.map((value) => <OptionPill key={value} selected={count === value} theme={theme} compact={compact} onClick={() => onConfigChange("count", String(value))}>{value}个</OptionPill>)}
                    </div>
                ) : null}
            </div>
        </SettingGroup>
    ) : null;

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className={compact ? "text-base font-semibold" : "text-lg font-semibold"}>视频设置</div> : null}
                {compact ? (
                    <div className="grid grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] items-start gap-x-4 gap-y-3 max-[580px]:grid-cols-1">
                        {ratioControls}
                        <div className="grid content-start gap-3">
                            {resolutionControls}
                            {durationControls}
                            {outputControls}
                        </div>
                    </div>
                ) : (
                    <>
                        {ratioControls}
                        {resolutionControls}
                        {durationControls}
                        {outputControls}
                    </>
                )}
            </div>
        </ImageSettingsTheme>
    );
}

function supportedValue<T extends string>(value: string, values: T[]): T {
    return (values.includes(value as T) ? value : values[0]) as T;
}

function supportedNumber(value: number, values: number[]) {
    return values.includes(value) ? value : values[0];
}

function videoRatioLabel(value: string) {
    return value === "adaptive" ? "自适应" : value;
}

function SeedanceVideoSettingsPanel({ config, onConfigChange, theme, showTitle, className, variant = "default" }: VideoSettingsPanelProps) {
    const model = modelOptionName(config.model || config.videoModel);
    const capabilities = seedanceCapabilitiesForModel(model);
    const resolution = normalizeSeedanceResolution(config.vquality, model);
    const ratio = normalizeSeedanceRatio(config.size);
    const duration = normalizeSeedanceDuration(config.videoSeconds);
    const generateAudio = boolConfig(config.videoGenerateAudio, true);
    const watermark = boolConfig(config.videoWatermark, false);
    if (variant === "composer") return <ComposerVideoSettingsPanel config={config} onConfigChange={onConfigChange} theme={theme} className={className} />;

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">视频设置</div> : null}
                <SettingGroup title="分辨率" color={theme.node.muted}>
                    <div className="grid grid-cols-3 gap-2.5">
                        {seedanceResolutionOptions.map((item) => {
                            const disabled = !capabilities.resolutions.includes(item.value);
                            return (
                                <OptionPill key={item.value} selected={resolution === item.value} disabled={disabled} theme={theme} onClick={() => onConfigChange("vquality", item.value)}>
                                    {item.label}
                                </OptionPill>
                            );
                        })}
                    </div>
                    {capabilities.resolutions.includes("1080p") ? null : <div className="text-[11px] leading-4 opacity-55">当前模型不支持 1080p，会自动使用 720p。</div>}
                </SettingGroup>
                <SettingGroup title="比例" color={theme.node.muted}>
                    <div className="grid grid-cols-3 gap-2.5">
                        {seedanceRatioOptions.map((item) => (
                            <button
                                key={item.value}
                                type="button"
                                className="flex h-[68px] cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border bg-transparent px-1 text-sm transition hover:opacity-80"
                                style={{ borderColor: ratio === item.value ? theme.node.text : theme.node.stroke, color: theme.node.text }}
                                onMouseDown={(event) => event.stopPropagation()}
                                onClick={() => onConfigChange("size", item.value)}
                            >
                                <SizePreview width={ratioPreview(item.value).width} height={ratioPreview(item.value).height} color={theme.node.text} />
                                <span>{item.label}</span>
                                <span className="text-[10px] leading-none opacity-55">{item.value === "adaptive" ? "adaptive" : seedancePixelLabel(resolution, item.value)}</span>
                            </button>
                        ))}
                    </div>
                </SettingGroup>
                <SettingGroup title="时长" color={theme.node.muted}>
                    <div className="grid grid-cols-4 gap-2.5">
                        {seedanceDurationOptions.map((value) => (
                            <OptionPill key={value} selected={duration === value} theme={theme} onClick={() => onConfigChange("videoSeconds", String(value))}>
                                {value === -1 ? "智能" : `${value}s`}
                            </OptionPill>
                        ))}
                    </div>
                    <NumberInput value={String(duration)} min={-1} max={15} theme={theme} onChange={(value) => onConfigChange("videoSeconds", value)} />
                </SettingGroup>
                <SettingGroup title="输出" color={theme.node.muted}>
                    <div className="grid gap-2 rounded-xl border p-2.5" style={{ borderColor: theme.node.stroke }}>
                        <SwitchRow label="生成声音" checked={generateAudio && capabilities.generateAudio} disabled={!capabilities.generateAudio} theme={theme} onChange={(checked) => onConfigChange("videoGenerateAudio", String(checked))} />
                        <SwitchRow label="添加水印" checked={watermark} theme={theme} onChange={(checked) => onConfigChange("videoWatermark", String(checked))} />
                    </div>
                </SettingGroup>
            </div>
        </ImageSettingsTheme>
    );
}

export function videoResolutionLabel(value: string) {
    return `${normalizeVideoResolutionValue(value)}p`;
}

export function videoSizeLabel(value: string) {
    const ratio = normalizeSeedanceRatio(value);
    if (value === "adaptive" || value === "auto") return "自适应";
    if (ratio === value) return seedanceRatioOptions.find((item) => item.value === ratio)?.label || ratio;
    const size = normalizeVideoSizeValue(value);
    return sizeOptions.find((item) => item.value === size)?.label || size;
}

export function videoSecondsLabel(value: string) {
    if (String(value).trim() === "-1") return "智能时长";
    return `${value || "6"}s`;
}

function ComposerVideoSettingsPanel({ config, onConfigChange, theme, className }: VideoSettingsPanelProps) {
    const ratio = normalizeSeedanceRatio(config.size);
    const resolution = normalizeVideoResolutionValue(config.vquality);
    const seconds = String(config.videoSeconds || "5");
    const count = String(config.count || "1");
    const generateAudio = config.videoGenerateAudio !== "false";
    const ratioItems = [
        { value: "adaptive", label: "Auto" },
        { value: "16:9", label: "16:9" },
        { value: "4:3", label: "4:3" },
        { value: "1:1", label: "1:1" },
        { value: "3:4", label: "3:4" },
        { value: "9:16", label: "9:16" },
        { value: "21:9", label: "21:9" },
    ];

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                <SettingGroup title="比例" color={theme.node.muted}>
                    <div className="grid grid-cols-5 gap-2.5">
                        {ratioItems.map((item) => (
                            <button key={item.value} type="button" className="flex h-[62px] flex-col items-center justify-center gap-1 rounded-lg border text-xs transition hover:opacity-80" style={{ borderColor: ratio === item.value ? theme.node.text : theme.node.stroke, background: ratio === item.value ? theme.node.fill : "transparent", color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()} onClick={() => onConfigChange("size", item.value)}>
                                <SizePreview width={ratioPreview(item.value).width} height={ratioPreview(item.value).height} color={theme.node.text} />
                                <span>{item.label}</span>
                            </button>
                        ))}
                    </div>
                </SettingGroup>
                <SettingGroup title="清晰度" color={theme.node.muted}>
                    <div className="grid grid-cols-2 gap-2.5">
                        {resolutionOptions.map((item) => (
                            <OptionPill key={item.value} selected={resolution === item.value} theme={theme} onClick={() => onConfigChange("vquality", item.value)}>
                                {item.label}
                            </OptionPill>
                        ))}
                    </div>
                </SettingGroup>
                <SettingGroup title="视频时长" color={theme.node.muted}>
                    <div className="flex items-center gap-3">
                        <input className="min-w-0 flex-1 accent-current" type="range" min="1" max="10" step="1" value={Number(seconds) || 5} onChange={(event) => onConfigChange("videoSeconds", event.target.value)} onMouseDown={(event) => event.stopPropagation()} />
                        <NumberBadge value={seconds} suffix="s" theme={theme} />
                    </div>
                </SettingGroup>
                <SettingGroup title="生成音频" color={theme.node.muted}>
                    <div className="grid grid-cols-2 gap-2.5">
                        <OptionPill selected={generateAudio} theme={theme} onClick={() => onConfigChange("videoGenerateAudio", "true")}>开启</OptionPill>
                        <OptionPill selected={!generateAudio} theme={theme} onClick={() => onConfigChange("videoGenerateAudio", "false")}>关闭</OptionPill>
                    </div>
                </SettingGroup>
                <SettingGroup title="生成数量" color={theme.node.muted}>
                    <div className="grid grid-cols-3 gap-2.5">
                        {["1", "2", "4"].map((value) => (
                            <OptionPill key={value} selected={count === value} theme={theme} onClick={() => onConfigChange("count", value)}>{value}个</OptionPill>
                        ))}
                    </div>
                </SettingGroup>
            </div>
        </ImageSettingsTheme>
    );
}

function NumberBadge({ value, suffix, theme }: { value: string; suffix: string; theme: CanvasTheme }) {
    return (
        <span className="inline-flex h-6 min-w-14 items-center justify-center rounded-md px-2 text-sm font-semibold" style={{ background: theme.node.fill, color: theme.node.text }}>
            {value} <span className="ml-1 text-xs opacity-60">{suffix}</span>
        </span>
    );
}

export function normalizeVideoSizeValue(value: string) {
    if (value === "auto") return "auto";
    if (/^\d+x\d+$/.test(value || "")) return value;
    return ["9:16", "2:3", "3:4"].includes(value) ? "720x1280" : "1280x720";
}

export function normalizeVideoResolutionValue(value: string) {
    if (value === "480p" || value === "low") return "480";
    if (value === "720p" || value === "auto" || value === "high" || value === "medium") return "720";
    return value.replace(/p$/i, "") || "720";
}

function OptionPill({ selected, disabled = false, theme, compact = false, onClick, children }: { selected: boolean; disabled?: boolean; theme: CanvasTheme; compact?: boolean; onClick: () => void; children: ReactNode }) {
    return (
        <button
            type="button"
            disabled={disabled}
            className={`${compact ? "h-8 text-xs" : "h-9 text-sm"} cursor-pointer rounded-full border px-2 transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-35`}
            style={{ background: "transparent", borderColor: selected ? theme.node.text : theme.node.stroke, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClick}
        >
            {children}
        </button>
    );
}

function SettingGroup({ title, color, compact = false, children }: { title: string; color: string; compact?: boolean; children: ReactNode }) {
    return (
        <div className={compact ? "space-y-1.5" : "space-y-2.5"}>
            <div className="text-xs font-medium" style={{ color }}>
                {title}
            </div>
            {children}
        </div>
    );
}

function ResolutionInput({ value, theme, onChange }: { value: string; theme: CanvasTheme; onChange: (value: string) => void }) {
    return (
        <label className="flex h-9 overflow-hidden rounded-full border text-sm" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
            <input
                type="number"
                min={1}
                className="min-w-0 flex-1 bg-transparent px-3 text-center outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                onMouseDown={(event) => event.stopPropagation()}
            />
            <span className="grid w-7 place-items-center pr-1" style={{ color: theme.node.muted }}>
                p
            </span>
        </label>
    );
}

function DimensionInput({ prefix, value, disabled, theme, onChange }: { prefix: string; value: number; disabled: boolean; theme: CanvasTheme; onChange: (value: number | null) => void }) {
    return (
        <label className="flex h-9 overflow-hidden rounded-xl text-sm" style={{ background: theme.node.fill, color: theme.node.text, opacity: disabled ? 0.55 : 1 }}>
            <span className="grid w-9 place-items-center" style={{ color: theme.node.muted }}>
                {prefix}
            </span>
            <input
                type="number"
                min={1}
                disabled={disabled}
                className="min-w-0 flex-1 bg-transparent px-2 outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                value={value || ""}
                onChange={(event) => onChange(Number(event.target.value) || null)}
                onMouseDown={(event) => event.stopPropagation()}
            />
        </label>
    );
}

function NumberInput({ value, min, max, theme, onChange }: { value: string; min: number; max: number; theme: CanvasTheme; onChange: (value: string) => void }) {
    return (
        <input
            type="number"
            min={min}
            max={max}
            className="h-9 rounded-full border bg-transparent px-3 text-center text-sm outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            style={{ borderColor: theme.node.stroke, color: theme.node.text, WebkitTextFillColor: theme.node.text }}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onMouseDown={(event) => event.stopPropagation()}
        />
    );
}

function SizePreview({ width, height, color }: { width: number; height: number; color: string }) {
    if (!width || !height) return null;
    const longSide = Math.max(width, height);
    const previewWidth = Math.max(10, Math.round((width / longSide) * 26));
    const previewHeight = Math.max(10, Math.round((height / longSide) * 26));
    return <span className="rounded-[3px] border-2" style={{ width: previewWidth, height: previewHeight, borderColor: color }} />;
}

function ratioPreview(ratio: string) {
    if (ratio === "9:16") return { width: 9, height: 16 };
    if (ratio === "1:1") return { width: 1, height: 1 };
    if (ratio === "4:3") return { width: 4, height: 3 };
    if (ratio === "3:4") return { width: 3, height: 4 };
    if (ratio === "21:9") return { width: 21, height: 9 };
    if (ratio === "adaptive") return { width: 0, height: 0 };
    return { width: 16, height: 9 };
}

function SwitchRow({ label, checked, disabled, theme, onChange }: { label: string; checked: boolean; disabled?: boolean; theme: CanvasTheme; onChange: (checked: boolean) => void }) {
    return (
        <div className="flex h-8 items-center justify-between gap-3">
            <span className="text-sm" style={{ color: theme.node.text }}>
                {label}
            </span>
            <span onMouseDown={(event) => event.stopPropagation()}>
                <Switch size="small" checked={checked} disabled={disabled} onChange={onChange} />
            </span>
        </div>
    );
}

function readSizeDimensions(size: string) {
    if (size === "auto") return { width: 0, height: 0 };
    const match = size.match(/^(\d+)x(\d+)$/);
    return { width: Number(match?.[1]) || 1280, height: Number(match?.[2]) || 720 };
}
