"use client";

import { type ReactNode } from "react";
import { Select } from "antd";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { audioFormatOptions, audioSpeedLabel, audioVoiceOptions, normalizeAudioFormatValue, normalizeAudioSpeedValue, normalizeAudioVoiceValue } from "@/lib/audio-generation";
import { type CanvasTheme } from "@/lib/canvas-theme";
import type { AiConfig } from "@/stores/use-config-store";

const speedOptions = ["0.75", "1", "1.25", "1.5"];

type AudioSettingKey = "audioVoice" | "audioFormat" | "audioSpeed" | "audioInstructions";

type AudioSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: AudioSettingKey, value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
};

export function AudioSettingsPanel({ config, onConfigChange, theme, showTitle = true, className = "w-[320px] space-y-4 rounded-2xl px-1 py-0.5" }: AudioSettingsPanelProps) {
    const voice = normalizeAudioVoiceValue(config.audioVoice);
    const format = normalizeAudioFormatValue(config.audioFormat);
    const speed = normalizeAudioSpeedValue(config.audioSpeed);
    const speedSelectOptions = speedOptions.map((value) => ({ value, label: audioSpeedLabel(value) }));

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">音频设置</div> : null}
                <SettingGroup title="声音" color={theme.node.muted}>
                    <AudioSelect value={voice} options={audioVoiceOptions} theme={theme} onChange={(value) => onConfigChange("audioVoice", value)} />
                </SettingGroup>
                <div className="grid grid-cols-2 gap-2.5">
                    <SettingGroup title="格式" color={theme.node.muted}>
                        <AudioSelect value={format} options={audioFormatOptions} theme={theme} onChange={(value) => onConfigChange("audioFormat", value)} />
                    </SettingGroup>
                    <SettingGroup title="语速" color={theme.node.muted}>
                        <AudioSelect value={speed} options={speedSelectOptions} theme={theme} onChange={(value) => onConfigChange("audioSpeed", value)} />
                    </SettingGroup>
                </div>
                <SettingGroup title="声音指令" color={theme.node.muted}>
                    <textarea
                        value={config.audioInstructions || ""}
                        placeholder="例如：自然、温暖、适合旁白。"
                        className="thin-scrollbar h-16 w-full resize-none rounded-xl border bg-transparent px-3 py-2 text-sm leading-5 outline-none"
                        style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                        onChange={(event) => onConfigChange("audioInstructions", event.target.value)}
                        onMouseDown={(event) => event.stopPropagation()}
                    />
                </SettingGroup>
            </div>
        </ImageSettingsTheme>
    );
}

function AudioSelect({ value, options, theme, onChange }: { value: string; options: Array<{ value: string; label: string }>; theme: CanvasTheme; onChange: (value: string) => void }) {
    return (
        <span className="block [&_.ant-select]:w-full" onMouseDown={(event) => event.stopPropagation()}>
            <Select value={value} options={options} onChange={onChange} />
        </span>
    );
}

function SettingGroup({ title, color, children }: { title: string; color: string; children: ReactNode }) {
    return (
        <div className="space-y-2">
            <div className="text-xs font-medium" style={{ color }}>
                {title}
            </div>
            {children}
        </div>
    );
}
