"use client";

import { AudioSettingsPanel } from "@/components/audio-settings-panel";
import { audioFormatLabel, audioSpeedLabel, audioVoiceLabel } from "@/lib/audio-generation";
import type { AiConfig } from "@/stores/use-config-store";
import { CanvasSettingsPopoverShell, type CanvasSettingsPopoverPlacement } from "./canvas-settings-popover-shell";

export type CanvasAudioSettingKey = "audioVoice" | "audioFormat" | "audioSpeed" | "audioInstructions";

type CanvasAudioSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: CanvasAudioSettingKey, value: string) => void;
    buttonClassName?: string;
    placement?: CanvasSettingsPopoverPlacement;
};

export function CanvasAudioSettingsPopover({ config, onConfigChange, buttonClassName, placement = "topLeft" }: CanvasAudioSettingsPopoverProps) {
    return (
        <CanvasSettingsPopoverShell
            label={`${audioVoiceLabel(config.audioVoice)} · ${audioFormatLabel(config.audioFormat)} · ${audioSpeedLabel(config.audioSpeed)}`}
            buttonClassName={buttonClassName}
            defaultButtonClassName="!h-8 !max-w-[170px] !justify-start !rounded-full !px-2.5"
            placement={placement}
        >
            {(theme) => <AudioSettingsPanel config={config} onConfigChange={onConfigChange} theme={theme} className="space-y-4" />}
        </CanvasSettingsPopoverShell>
    );
}
