"use client";

import { useEffect, useState } from "react";
import { Button, Modal } from "antd";
import { WandSparkles } from "lucide-react";

import { LIGHTING_COLORS, LIGHTING_DIRECTIONS, LIGHTING_INTENSITIES, buildLightingPrompt, type CanvasLightingOption, type CanvasLightingSettings } from "../utils/canvas-image-tools";

export function CanvasNodeLightingDialog({ dataUrl, open, onClose, onConfirm }: { dataUrl: string; open: boolean; onClose: () => void; onConfirm: (settings: CanvasLightingSettings) => void }) {
    const [settings, setSettings] = useState<CanvasLightingSettings>({});

    useEffect(() => {
        if (open) setSettings({});
    }, [dataUrl, open]);

    const toggle = (key: keyof CanvasLightingSettings, id: string) => setSettings((current) => ({ ...current, [key]: current[key] === id ? undefined : id }));

    return (
        <Modal title={null} open={open && Boolean(dataUrl)} onCancel={onClose} footer={null} width={760} centered destroyOnHidden>
            <div className="space-y-5">
                <div>
                    <h2 className="text-xl font-semibold">AI 打光</h2>
                    <p className="mt-1 text-sm opacity-60">保持画面内容不变，按所选参数重新调整光影，结果基于原图重新生成</p>
                </div>
                <div className="grid gap-6 md:grid-cols-[minmax(260px,1fr)_280px]">
                    <div className="grid min-h-[300px] place-items-center rounded-xl border p-4">
                        <img src={dataUrl} alt="" className="max-h-[320px] max-w-full rounded-lg object-contain" draggable={false} />
                    </div>
                    <div className="space-y-5 py-2">
                        <LightingGroup title="主光方向" options={LIGHTING_DIRECTIONS} value={settings.direction} onSelect={(id) => toggle("direction", id)} />
                        <LightingGroup title="光色" options={LIGHTING_COLORS} value={settings.color} onSelect={(id) => toggle("color", id)} />
                        <LightingGroup title="强度" options={LIGHTING_INTENSITIES} value={settings.intensity} onSelect={(id) => toggle("intensity", id)} />
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button type="primary" size="large" icon={<WandSparkles className="size-4" />} disabled={!buildLightingPrompt(settings)} onClick={() => onConfirm(settings)}>
                        AI 生成
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function LightingGroup({ title, options, value, onSelect }: { title: string; options: CanvasLightingOption[]; value?: string; onSelect: (id: string) => void }) {
    return (
        <div className="space-y-2">
            <div className="text-sm font-medium opacity-75">{title}</div>
            <div className="flex flex-wrap gap-2">
                {options.map((option) => (
                    <Button key={option.id} size="small" type={value === option.id ? "primary" : "default"} onClick={() => onSelect(option.id)}>
                        {option.label}
                    </Button>
                ))}
            </div>
        </div>
    );
}
