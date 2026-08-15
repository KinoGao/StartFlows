"use client";

import { Camera } from "lucide-react";
import { ConfigProvider, Select, Switch } from "antd";

import type { CanvasTheme } from "@/lib/canvas-theme";
import type { CameraControlOptions } from "../types";
import { APERTURE_OPTIONS, CAMERA_OPTIONS, cameraControlLabel, cameraControlSummary, DEFAULT_CAMERA_CONTROL, FOCAL_LENGTH_OPTIONS, LENS_OPTIONS, normalizeCameraControl } from "../utils/canvas-camera";
import { CanvasSettingsPopoverShell, type CanvasSettingsPopoverPlacement } from "./canvas-settings-popover-shell";

type CanvasCameraControlProps = {
    value?: CameraControlOptions;
    onChange: (value: CameraControlOptions) => void;
    buttonClassName?: string;
    placement?: CanvasSettingsPopoverPlacement;
};

export function CanvasCameraControl({ value, onChange, buttonClassName, placement = "topLeft" }: CanvasCameraControlProps) {
    const control = normalizeCameraControl(value || DEFAULT_CAMERA_CONTROL);
    const update = (patch: Partial<CameraControlOptions>) => onChange({ ...control, ...patch });

    return (
        <CanvasSettingsPopoverShell label={cameraControlLabel(control)} icon={<Camera className="size-3.5" />} buttonClassName={buttonClassName} defaultButtonClassName="!h-8 !max-w-[170px] !justify-start !rounded-full !px-2.5" placement={placement}>
            {(theme) => (
                <CameraPanel
                    control={control}
                    theme={theme}
                    onEnabledChange={(enabled) => update({ enabled })}
                    onCameraChange={(camera) => update({ camera })}
                    onLensChange={(lens) => update({ lens })}
                    onFocalLengthChange={(focalLength) => update({ focalLength })}
                    onApertureChange={(aperture) => update({ aperture })}
                />
            )}
        </CanvasSettingsPopoverShell>
    );
}

function CameraPanel({
    control,
    theme,
    onEnabledChange,
    onCameraChange,
    onLensChange,
    onFocalLengthChange,
    onApertureChange,
}: {
    control: CameraControlOptions;
    theme: CanvasTheme;
    onEnabledChange: (value: boolean) => void;
    onCameraChange: (value: string) => void;
    onLensChange: (value: string) => void;
    onFocalLengthChange: (value: number) => void;
    onApertureChange: (value: number) => void;
}) {
    const selectTheme = {
        token: { colorBgContainer: theme.node.fill, colorBgElevated: theme.toolbar.panel, colorBorder: theme.node.stroke, colorPrimary: theme.node.activeStroke, colorText: theme.node.text, colorTextPlaceholder: theme.node.muted },
    };

    return (
        <ConfigProvider theme={selectTheme}>
            <div className="space-y-3" style={{ color: theme.node.text }}>
                <div className="flex items-center justify-between gap-4">
                    <div className="text-base font-semibold">镜头控制</div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs" style={{ color: control.enabled ? theme.node.text : theme.node.muted }}>
                            {control.enabled ? "开启" : "关闭"}
                        </span>
                        <Switch size="small" checked={control.enabled} onChange={onEnabledChange} aria-label="镜头控制" />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5" style={{ opacity: control.enabled ? 1 : 0.52 }}>
                    <CameraField label="摄影机" theme={theme}>
                        <Select value={control.camera} options={CAMERA_OPTIONS} disabled={!control.enabled} listHeight={176} styles={{ popup: { root: { zIndex: 1305 } } }} onChange={onCameraChange} />
                    </CameraField>
                    <CameraField label="镜头" theme={theme}>
                        <Select value={control.lens} options={LENS_OPTIONS} disabled={!control.enabled} listHeight={176} styles={{ popup: { root: { zIndex: 1305 } } }} onChange={onLensChange} />
                    </CameraField>
                    <CameraField label="焦距" theme={theme}>
                        <Select
                            value={control.focalLength}
                            options={FOCAL_LENGTH_OPTIONS.map((value) => ({ value, label: `${value} mm` }))}
                            disabled={!control.enabled}
                            listHeight={176}
                            styles={{ popup: { root: { zIndex: 1305 } } }}
                            onChange={onFocalLengthChange}
                        />
                    </CameraField>
                    <CameraField label="光圈" theme={theme}>
                        <Select value={control.aperture} options={APERTURE_OPTIONS.map((value) => ({ value, label: `f/${value}` }))} disabled={!control.enabled} listHeight={176} styles={{ popup: { root: { zIndex: 1305 } } }} onChange={onApertureChange} />
                    </CameraField>
                </div>
                <div className="border-t pt-2.5 text-xs leading-5" style={{ borderColor: theme.node.stroke, color: theme.node.muted }}>
                    {cameraControlSummary(control)}
                </div>
            </div>
        </ConfigProvider>
    );
}

function CameraField({ label, theme, children }: { label: string; theme: CanvasTheme; children: React.ReactNode }) {
    return (
        <label className="min-w-0 space-y-1">
            <span className="block text-xs font-medium" style={{ color: theme.node.muted }}>
                {label}
            </span>
            <span className="block [&_.ant-select]:w-full">{children}</span>
        </label>
    );
}
